// getPersonalInfo/src/index.js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.TABLE_NAME || "RingiPersonalInfo";

// commutes の柔軟パース（配列/文字列JSON/文字列）
function parseCommutes(raw) {
  try {
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

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return withCors({}, 200);
  }
  if (event.httpMethod !== "GET") {
    return withCors({ message: "Method Not Allowed" }, 405);
  }

  const qs = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qs.limit || "50", 10), 200);
  const nextToken = qs.nextToken ? JSON.parse(Buffer.from(qs.nextToken, "base64").toString("utf8")) : undefined;
  const from = qs.from ? new Date(qs.from) : null;
  const to = qs.to ? new Date(qs.to) : null;
  const statusFilter = qs.status || "";

  // 現状は Scan + クライアント側フィルタ
  // もし GSI (例えば createdAt を sort key にした index) があれば Query に切替推奨
  const scanInput = {
    TableName: TABLE,
    Limit: limit,
    ExclusiveStartKey: nextToken
  };

  const scanRes = await ddb.send(new ScanCommand(scanInput));
  const items = scanRes.Items || [];

  // フィルタリング（from/to, status）
  const filtered = items.filter((it) => {
    if (from || to) {
      const created = it.createdAt ? new Date(it.createdAt) : null;
      if (!created) return false;
      if (from && created < from) return false;
      if (to && created > to) return false;
    }
    if (statusFilter) {
      // 全体ステータスで絞りたい場合は承認者ステータスから推定
      const approverStatuses = [it.approver1Status, it.approver2Status].filter(Boolean);
      const overall = it.status === "cancel" ? "cancel" : mapStatusForOverall(approverStatuses);
      if (overall !== statusFilter) return false;
    }
    return true;
  });

  const mapped = filtered.map(rowToPersonalInfo);

  // 返却
  const body = {
    personalInfoRequests: mapped,
  };
  if (scanRes.LastEvaluatedKey) {
    body.nextToken = Buffer.from(JSON.stringify(scanRes.LastEvaluatedKey)).toString("base64");
  }

  return withCors(body, 200);
};