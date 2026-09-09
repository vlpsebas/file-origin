# file-origin
a versatile file upload origin. can be direct http or r2 object


# File Upload Examples

The file-origin worker accepts file uploads via **two methods**:

## Method 1: Raw Binary Upload (Recommended for exact file copy)

```bash
# Upload a file from your laptop
curl -X POST "https://file-origin.your-domain.workers.dev/upload?filename=my-crl.pem" \
  -H "X-Admin-Secret: your-secret" \
  --data-binary @/path/to/file.pem

# Local dev
curl -X POST "http://localhost:8788/upload?filename=test-crl.pem" \
  -H "X-Admin-Secret: dev-secret-12345" \
  --data-binary @test-crl.pem
```

**Preserves:** Exact binary content, file size, no encoding changes

## Method 2: Multipart Form Data (Browser-style upload)

```bash
# Upload using form data
curl -X POST "https://file-origin.your-domain.workers.dev/upload?filename=my-crl.pem" \
  -H "X-Admin-Secret: your-secret" \
  -F "file=@/path/to/file.pem"

# Local dev
curl -X POST "http://localhost:8788/upload?filename=test-crl.pem" \
  -H "X-Admin-Secret: dev-secret-12345" \
  -F "file=@test-crl.pem"
```

**Useful for:** Browser-based uploads, HTML forms

## From Your Laptop

Both methods work identically from your laptop:

```bash
# 1. Navigate to your file's directory
cd ~/Downloads

# 2. Upload using raw binary (exact copy)
curl -X POST "http://localhost:8788/upload?filename=certificate.crl" \
  -H "X-Admin-Secret: dev-secret-12345" \
  --data-binary @certificate.crl

# 3. Verify upload
curl -s "http://localhost:8788/file/certificate.crl/info" \
  -H "X-Admin-Secret: dev-secret-12345" | jq
```

## Upload Response

```json
{
  "success": true,
  "message": "File uploaded",
  "filename": "test-crl.pem",
  "size": 2048,
  "size_mb": "0.00",
  "content_type": "application/x-pem-file",
  "url": "http://localhost:8788/file/test-crl.pem",
  "uploaded_at": "2026-09-09T16:05:00.000Z"
}
```

## Complete Flow Example

```bash
# 1. Upload CRL from your laptop
curl -X POST "http://localhost:8788/upload?filename=my-ca.crl" \
  -H "X-Admin-Secret: dev-secret-12345" \
  --data-binary @/path/to/my-ca.crl

# 2. Trigger import in crl-checker
curl -X POST "http://localhost:8787/crl/import/fetch?file=my-ca.crl" \
  -H "X-Admin-Secret: dev-secret-12345"

# 3. Verify import
curl -s "http://localhost:8787/crl/import/status" \
  -H "X-Admin-Secret: dev-secret-12345" | jq
```

## Tips

- **Use `--data-binary`** for CRL files, certificates, or any binary content
- **Use `-F file=@`** for browser-style uploads or when content type matters
- **Filename is required** via `?filename=` query parameter
- **Authentication required** via `X-Admin-Secret` header
- **Max file size:** 100MB (configurable via `MAX_UPLOAD_SIZE_MB` env var)

## Testing Locally

```bash
# Create a test file
echo "Test content" > test.txt

# Upload it
curl -X POST "http://localhost:8788/upload?filename=test.txt" \
  -H "X-Admin-Secret: dev-secret-12345" \
  --data-binary @test.txt

# Download it back
curl "http://localhost:8788/file/test.txt"

# Should output: Test content
```
