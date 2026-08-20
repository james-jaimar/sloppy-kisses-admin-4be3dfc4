# Reliable email logo delivery

## Recommendation

Use a **permanent public HTTPS/CDN URL** for the Sloppy Kisses logo in every email. Keep the quote PDF as the only attachment.

Do not use:
- expiring signed URLs;
- base64/data-URI images, which Outlook handles inconsistently;
- the current CID attachment path, because the pinned SMTP library marks the logo as a normal attachment and does not construct Outlook-safe `multipart/related` MIME.

## Implementation

1. Store the email logo as a public, non-sensitive branding asset with a stable, non-expiring URL and long-lived cache headers.
2. Update quote send and preview paths to resolve the exact same public logo URL.
3. Remove the CID logo attachment; leave only the quote PDF in the attachment list.
4. Retain the tenant name as a styled text fallback and set useful `alt` text, so the header remains branded when a recipient blocks remote images.
5. Add safe URL validation and logging; if the logo cannot be resolved, send the email with the text fallback rather than a broken image.
6. Send a real test through the configured tenant SMTP and verify it in Outlook and a webmail client.

## Technical notes

The current code references `cid:tenant-logo`, but Denomailer 1.6.0 always emits `Content-Disposition: attachment` and places the logo beside the PDF in a flat `multipart/mixed` message. Outlook can therefore expose the logo as an attachment and fail to resolve it inline. A stable public image URL avoids this MIME limitation without replacing the existing SMTP system.

Remote images may still be hidden when a recipient explicitly disables image downloads; no implementation can override that client privacy setting. The text fallback ensures the email remains presentable in that case.