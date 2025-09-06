// getPersonalInfo/src/index.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const sts = new STSClient({});

const TABLE = process.env.TABLE_NAME || "RingiPersonalInfo";
console.log("[getPersonalInfo] Booting function. TABLE:", TABLE, "NODE_ENV:", process.env.NODE_ENV, "AWS_REGION:", process.env.AWS_REGION);

// commutes の柔軟パース（配列/文字列JSON/文字列）
function parseCommutes(raw) {
  try {
    // console.debug("[parseCommutes] raw:", typeof raw, Array.isArray(raw) ? "(array)" : raw);
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      }
      // カンマ区切り等もケア
      return raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

function pickCommuteInfo(commutes) {
  // オブジェクト配列なら route/name 等を優先して文字列化
  const toText = (c) => {
    if (!c) return "";
    if (typeof c === "string") return c;
    if (typeof c === "object") {
      // よくあるキー候補
      const keys = ["route", "name", "text", "detail", "fromTo"];
      for (const k of keys) {
        if (c[k]) return String(c[k]);
      }
      // 値をつないで1行に
      return Object.values(c).map(v => (v == null ? "" : String(v))).filter(Boolean).join(" / ");
    }
    return String(c);
  };

  const c0 = commutes[0] ? toText(commutes[0]) : "";
  const c1 = commutes[1] ? toText(commutes[1]) : "";
  const c2 = commutes[2] ? toText(commutes[2]) : "";
  return { commuteInfo1: c0, commuteInfo2: c1, commuteInfo3: c2 };
}

function mapStatusForOverall(approverStatuses = []) {
  if (approverStatuses.includes("否決")) return "否決";
  if (approverStatuses.includes("承認待ち")) return "承認待ち";
  if (approverStatuses.length > 0 && approverStatuses.every(s => s === "承認")) return "承認";
  return "その他";
}

function rowToPersonalInfo(item) {
  // console.debug("[rowToPersonalInfo] requestId:", item && item.requestId);
  const commutes = parseCommutes(item.commutes);
  const { commuteInfo1, commuteInfo2, commuteInfo3 } = pickCommuteInfo(commutes);

  const approvers = [
    {
      approverId: item.approver1Id || "",
      approverName: item.approver1Name || "",
      approverStatus: item.approver1Status || "",   // "承認" / "承認待ち" / "否決" など
      approverApprovedAt: "",                       // CSVにないため空
      approverComment: ""                           // CSVにないため空
    },
    {
      approverId: item.approver2Id || "",
      approverName: item.approver2Name || "",
      approverStatus: item.approver2Status || "",
      approverApprovedAt: "",
      approverComment: ""
    }
  ].filter(a => a.approverId || a.approverName); // 空行は削除

  return {
    requestId: item.requestId,
    userId: item.applicantId,
    displayName: item.applicantName,
    departmentName: item.department,
    changeType: item.changeType,
    submittedAt: item.createdAt,
    status: item.status, // cancel が入る可能性
    newAddress: item.addressNew,
    newPhoneNumber: item.phoneNew,
    commuteInfo1,
    commuteInfo2,
    commuteInfo3,
    commuteCostTotal: item.totalFare,
    approvers
  };
}

function withCors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  // Normalize method & path across Lambda URL / API Gateway (REST, HTTP v2)
  const method =
    (event && event.httpMethod) ||
    (event && event.requestContext && event.requestContext.http && event.requestContext.http.method) ||
    (event && event.requestContext && event.requestContext.httpMethod) ||
    'GET';
  const path =
    (event && event.path) ||
    (event && event.requestContext && event.requestContext.http && event.requestContext.http.path) ||
    '/';

  try {
    const id = await sts.send(new GetCallerIdentityCommand({}));
    console.log("[handler] caller identity:", { account: id.Account, arn: id.Arn, userId: id.UserId });
  } catch (e) {
    console.warn("[handler] failed to get caller identity:", e && e.message);
  }

  console.log("[handler] invoked. method:", method, "path:", path, "table:", TABLE);
  // console.debug("[handler] headers:", event && event.headers);
  if (method === "OPTIONS") {
    return withCors({}, 200);
  }
  if (method !== "GET") {
    return withCors({ message: "Method Not Allowed" }, 405);
  }

  console.log("[handler] start full-scan fetch. No query params used.");
  const items = [];
  let ExclusiveStartKey = undefined;

  try {
    do {
      const startedAt = Date.now();
      const res = await ddb.send(new ScanCommand({
        TableName: TABLE,
        ExclusiveStartKey
      }));
      const duration = Date.now() - startedAt;
      console.log("[handler] scan page fetched.", "items:", (res.Items && res.Items.length) || 0, "hasMore:", !!res.LastEvaluatedKey, "durationMs:", duration);
      if (res.Items && res.Items.length) {
        items.push(...res.Items);
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  } catch (e) {
    console.error("DynamoDB Scan error:", e);
    if (e && e.$metadata) {
      console.error("[handler] ddb metadata:", e.$metadata);
    }
    return withCors({ message: "Internal Server Error" }, 500);
  }

  console.log("[handler] scan completed. totalItems:", items.length);

  let mapped = [];
  try {
    mapped = items.map(rowToPersonalInfo);
  } catch (e) {
    console.error("[handler] mapping error:", e && e.message);
    // 一部壊れたデータがあっても他は返せるようにする
    mapped = [];
    for (const it of items) {
      try {
        mapped.push(rowToPersonalInfo(it));
      } catch (ee) {
        console.error("[handler] row mapping failed for requestId:", it && it.requestId, "error:", ee && ee.message);
      }
    }
  }
  console.log("[handler] mapping completed. mappedCount:", mapped.length);
  if (mapped.length > 0) {
    console.log("[handler] firstItem(sample):", {
      requestId: mapped[0].requestId,
      changeType: mapped[0].changeType,
      submittedAt: mapped[0].submittedAt,
      approversCount: (mapped[0].approvers && mapped[0].approvers.length) || 0
    });
  }

  // 全件返却（ページングは行わない）
  const body = {
    personalInfoRequests: mapped
  };
  console.log("[handler] responding 200 with personalInfoRequests:", body.personalInfoRequests.length);
  return withCors(body, 200);
};