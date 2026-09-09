// ============================================================
// File Origin Worker - Generic R2 File Upload/Download Service
// ============================================================

// Helper functions
const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

const errorResponse = (message, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

// ============================================================
// Main Worker
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const ADMIN_SECRET = env.ADMIN_SECRET || "dev-secret-12345";
    const MAX_SIZE_MB = parseInt(env.MAX_UPLOAD_SIZE_MB || "100");

    // Authenticate admin requests
    const authenticate = () => {
      const providedSecret = request.headers.get("X-Admin-Secret");
      if (!providedSecret || providedSecret !== ADMIN_SECRET) {
        throw new Error("Unauthorized");
      }
    };

    try {
      // GET /health
      if (path === "/health") {
        return jsonResponse({
          success: true,
          service: "file-origin",
          timestamp: new Date().toISOString(),
          r2_configured: !!env.FILES,
        });
      }

      // POST /upload - Upload file to R2
      if (path === "/upload" && request.method === "POST") {
        authenticate();

        if (!env.FILES) {
          return errorResponse("R2 bucket not configured", 503);
        }

        const filename = url.searchParams.get("filename") || url.searchParams.get("name") || `file-${Date.now()}`;
        
        // Handle different upload methods
        let body;
        let contentType;
        const requestContentType = request.headers.get("content-type") || "";

        // Method 1: multipart/form-data (browser file uploads, curl -F)
        if (requestContentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const file = formData.get("file");
          
          if (!file) {
            return errorResponse("No file found in form data. Use field name 'file' or send raw binary data.");
          }

          body = await file.arrayBuffer();
          contentType = file.type || "application/octet-stream";
        }
        // Method 2: Raw binary (curl --data-binary, application/octet-stream)
        else {
          body = await request.arrayBuffer();
          contentType = requestContentType || "application/octet-stream";
        }

        const sizeMB = body.byteLength / (1024 * 1024);

        if (sizeMB > MAX_SIZE_MB) {
          return errorResponse(`File too large (${sizeMB.toFixed(2)}MB, max ${MAX_SIZE_MB}MB)`, 413);
        }

        // Upload to R2
        await env.FILES.put(filename, body, {
          httpMetadata: {
            contentType: contentType,
          },
          customMetadata: {
            uploaded_at: new Date().toISOString(),
            size: body.byteLength.toString(),
            original_filename: filename,
          },
        });

        return jsonResponse({
          success: true,
          message: "File uploaded",
          filename: filename,
          size: body.byteLength,
          size_mb: sizeMB.toFixed(2),
          content_type: contentType,
          url: `${url.origin}/file/${filename}`,
          uploaded_at: new Date().toISOString(),
        }, 201);
      }

      // GET /file/:filename - Download file from R2
      if (path.startsWith("/file/") && request.method === "GET") {
        if (!env.FILES) {
          return errorResponse("R2 bucket not configured", 503);
        }

        const filename = path.replace("/file/", "");
        if (!filename) {
          return errorResponse("Filename required");
        }

        const object = await env.FILES.get(filename);
        if (!object) {
          return errorResponse("File not found", 404);
        }

        return new Response(object.body, {
          headers: {
            "content-type": object.httpMetadata.contentType || "application/octet-stream",
            "content-length": object.size.toString(),
            "last-modified": object.uploaded.toUTCString(),
            "etag": object.etag,
            "cache-control": "public, max-age=31536000",
          },
        });
      }

      // GET /file/:filename/info - Get file metadata
      if (path.startsWith("/file/") && path.endsWith("/info") && request.method === "GET") {
        authenticate();

        if (!env.FILES) {
          return errorResponse("R2 bucket not configured", 503);
        }

        const filename = path.replace("/file/", "").replace("/info", "");
        if (!filename) {
          return errorResponse("Filename required");
        }

        const object = await env.FILES.head(filename);
        if (!object) {
          return errorResponse("File not found", 404);
        }

        return jsonResponse({
          success: true,
          filename: filename,
          size: object.size,
          size_mb: (object.size / (1024 * 1024)).toFixed(2),
          content_type: object.httpMetadata.contentType,
          uploaded: object.uploaded.toISOString(),
          etag: object.etag,
          custom_metadata: object.customMetadata,
        });
      }

      // DELETE /file/:filename - Delete file from R2
      if (path.startsWith("/file/") && request.method === "DELETE") {
        authenticate();

        if (!env.FILES) {
          return errorResponse("R2 bucket not configured", 503);
        }

        const filename = path.replace("/file/", "");
        if (!filename) {
          return errorResponse("Filename required");
        }

        await env.FILES.delete(filename);

        return jsonResponse({
          success: true,
          message: "File deleted",
          filename: filename,
        });
      }

      // GET /list - List all files
      if (path === "/list" && request.method === "GET") {
        authenticate();

        if (!env.FILES) {
          return errorResponse("R2 bucket not configured", 503);
        }

        const prefix = url.searchParams.get("prefix") || "";
        const limit = parseInt(url.searchParams.get("limit") || "100");

        const listed = await env.FILES.list({ prefix, limit });

        return jsonResponse({
          success: true,
          count: listed.objects.length,
          truncated: listed.truncated,
          files: listed.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            size_mb: (obj.size / (1024 * 1024)).toFixed(2),
            uploaded: obj.uploaded.toISOString(),
            etag: obj.etag,
          })),
        });
      }

      // GET / - Service info
      if (path === "/" || path === "") {
        return jsonResponse({
          success: true,
          service: "file-origin",
          description: "Generic R2 file upload/download service",
          endpoints: {
            upload: "POST /upload?filename=<name> — Upload file to R2 (admin only)",
            download: "GET /file/<filename> — Download file from R2 (public)",
            info: "GET /file/<filename>/info — Get file metadata (admin only)",
            delete: "DELETE /file/<filename> — Delete file from R2 (admin only)",
            list: "GET /list?prefix=&limit=100 — List all files (admin only)",
            health: "GET /health — Service health check (public)",
          },
          upload_methods: {
            raw_binary: "curl -X POST 'https://worker/upload?filename=test.txt' -H 'X-Admin-Secret: xxx' --data-binary @file.txt",
            form_data: "curl -X POST 'https://worker/upload?filename=test.txt' -H 'X-Admin-Secret: xxx' -F 'file=@file.txt'",
            from_laptop: "Both methods work from your laptop - use --data-binary for exact file copy"
          },
          authentication: "Include X-Admin-Secret header for admin endpoints",
        });
      }

      return errorResponse("Endpoint not found", 404);

    } catch (e) {
      if (e.message === "Unauthorized") {
        return errorResponse("Unauthorized: invalid or missing X-Admin-Secret", 401);
      }
      return errorResponse(`Server error: ${e.message}`, 500);
    }
  },
};
