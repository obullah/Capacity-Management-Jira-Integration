// api/jira/bulk-create.js
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const {
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
    JIRA_PROJECT_KEY,
    JIRA_ISSUE_TYPE = "Story",
    JIRA_STORY_POINTS_FIELD = "customfield_10016",
  } = process.env;

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
    return res.status(500).json({
      message:
        "Missing Jira env vars. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY in Vercel.",
    });
  }

  const { issues } = req.body || {};
  if (!Array.isArray(issues) || issues.length === 0) {
    return res
      .status(400)
      .json({ message: "Body must contain a non-empty 'issues' array." });
  }

  const jiraClient = axios.create({
    baseURL: `${JIRA_BASE_URL}/rest/api/3`,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization:
        "Basic " +
        Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),
    },
  });

  const results = [];

  for (const issue of issues) {
    const {
      excelRowIndex,
      issueId,
      assignee,
      storyPoints,
      summary,
      description,
    } = issue;

    if (!summary) {
      results.push({
        excelRowIndex,
        issueId,
        success: false,
        errorMessage: "Missing summary – issue not created.",
      });
      continue;
    }

    const fields = {
      project: { key: JIRA_PROJECT_KEY },
      summary,
      description,
      issuetype: { name: JIRA_ISSUE_TYPE },
    };

    if (
      storyPoints !== null &&
      storyPoints !== undefined &&
      storyPoints !== ""
    ) {
      fields[JIRA_STORY_POINTS_FIELD] = Number(storyPoints);
    }

    // For Jira Cloud, "assignee" should be accountId in your Excel
    if (assignee) {
      fields.assignee = { accountId: assignee };
      // For Jira Server/DC you might instead use: { name: assignee }
    }

    try {
      const response = await jiraClient.post("/issue", { fields });
      results.push({
        excelRowIndex,
        issueId,
        jiraKey: response.data.key,
        success: true,
        errorMessage: null,
      });
    } catch (err) {
      console.error("Jira create error:", err?.response?.data || err.message);
      const message =
        err?.response?.data?.errors
          ? JSON.stringify(err.response.data.errors)
          : err?.response?.data?.errorMessages?.join(", ") ||
            err.message ||
            "Unknown error";

      results.push({
        excelRowIndex,
        issueId,
        jiraKey: null,
        success: false,
        errorMessage: message,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return res.status(200).json({
    successCount,
    failureCount,
    results,
  });
}
