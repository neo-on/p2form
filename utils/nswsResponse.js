/**
 * Helpers for reading NSWS's `saveP2Data` response.
 *
 * NSWS answers with HTTP 200 for BOTH accepted and rejected filings:
 *
 *   accepted : {"status":"200","message":"Success","UniqueId":"SWSID_PlantCode_Month_Epoch"}
 *   rejected : {"status":"200","message":"Kindly provide mandatory subField ...","uniqueId":null}
 *   rejected : {"status":"200","message":"P2 Data already submitted for the month i.e. October","uniqueId":null}
 *
 * The acknowledgement id is therefore the ONLY reliable success signal - and NSWS is
 * inconsistent about its casing. The official "P2 Form API Document v1.3" documents the
 * success key as `UniqueId` (capital U), while the integration-process document shows
 * `uniqueId` on the failure payloads. Matching a fixed list of spellings would silently
 * treat a genuine success as a rejection, so the lookup below is case-insensitive and
 * separator-insensitive.
 */

/** Matches uniqueId / uniqueID / UniqueId / UNIQUEID / unique_id / unique-id. */
const UNIQUE_ID_KEY = /^unique[\s_-]*id$/i;

/**
 * Returns the acknowledgement id from an NSWS response body, or '' when the body
 * carries none (which means the filing was NOT recorded).
 */
function extractUniqueId(data) {
  if (!data || typeof data !== 'object') return '';
  for (const key of Object.keys(data)) {
    if (!UNIQUE_ID_KEY.test(key)) continue;
    const value = data[key];
    if (value == null) continue;
    const text = String(value).trim();
    // NSWS sends the JSON literal null on rejection; some proxies stringify it.
    if (!text || text === 'null' || text === 'undefined') continue;
    return text;
  }
  return '';
}

/**
 * Decides whether an NSWS response represents a filing that was actually recorded.
 * Returns { accepted, uniqueId, message }.
 */
function interpretNswsResponse(data) {
  const uniqueId = extractUniqueId(data);
  const status = data && data.status;
  const statusOk = !data || status === undefined || status === null ||
    String(status).trim() === '200';
  return {
    accepted: Boolean(statusOk && uniqueId),
    uniqueId,
    message: (data && data.message) ? String(data.message) : ''
  };
}

module.exports = { extractUniqueId, interpretNswsResponse };
