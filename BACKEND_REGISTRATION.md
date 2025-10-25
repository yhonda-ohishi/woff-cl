# バックエンド登録ガイド

このフロントエンドアプリケーションは、Durable Objectsを使用してバックエンドURLを動的に管理します。
Cloudflare Tunnelなどで起動するたびにURLが変わる環境に対応しています。

## 概要

1. バックエンドサーバーが起動時に、フロントエンドに自身のURLを登録
2. フロントエンドはそのURLをDurable Objectに保存
3. 以降のAPIリクエストは保存されたURLにプロキシ

## バックエンド登録エンドポイント

### POST /register-backend

バックエンドサーバーが自身のURLを登録するエンドポイント

**認証**: Bearer Token (Secret)

**リクエスト**:
```bash
curl -X POST https://your-frontend.pages.dev/register-backend \
  -H "Authorization: Bearer YOUR_SECRET_HERE" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-backend-tunnel.trycloudflare.com"}'
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "url": "https://your-backend-tunnel.trycloudflare.com"
}
```

**レスポンス（認証失敗）**:
```json
{
  "error": "Unauthorized"
}
```
ステータスコード: 401

**レスポンス（URLが空）**:
```json
{
  "error": "Missing url in request body"
}
```
ステータスコード: 400

## Secret設定

### 開発環境

開発環境では、デフォルトのsecret `dev-secret-123` が使用されます。

### 本番環境

本番環境では、Cloudflare Secretを設定する必要があります：

```bash
# Secretを設定（対話式）
npx wrangler secret put BACKEND_SECRET

# または、パイプで値を渡す
echo "your-secure-random-secret" | npx wrangler secret put BACKEND_SECRET
```

**重要**: Secretは十分に長く、ランダムな値を使用してください。

推奨される生成方法：
```bash
# Linuxの場合
openssl rand -base64 32

# Node.jsの場合
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## バックエンド実装例

### Goでの実装例

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
)

func registerBackend(frontendURL, backendURL, secret string) error {
    payload := map[string]string{
        "url": backendURL,
    }

    body, err := json.Marshal(payload)
    if err != nil {
        return err
    }

    req, err := http.NewRequest("POST", frontendURL+"/register-backend", bytes.NewBuffer(body))
    if err != nil {
        return err
    }

    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+secret)

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        return fmt.Errorf("registration failed with status: %d", resp.StatusCode)
    }

    return nil
}

func main() {
    frontendURL := "https://your-frontend.pages.dev"
    backendURL := os.Getenv("BACKEND_URL") // Cloudflare TunnelのURL
    secret := os.Getenv("FRONTEND_SECRET")

    if err := registerBackend(frontendURL, backendURL, secret); err != nil {
        fmt.Printf("Failed to register backend: %v\n", err)
        os.Exit(1)
    }

    fmt.Println("Backend registered successfully")

    // gRPCサーバー起動など...
}
```

### Node.js/TypeScriptでの実装例

```typescript
async function registerBackend(
  frontendURL: string,
  backendURL: string,
  secret: string
): Promise<void> {
  const response = await fetch(`${frontendURL}/register-backend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
    },
    body: JSON.stringify({ url: backendURL }),
  });

  if (!response.ok) {
    throw new Error(`Registration failed: ${response.statusText}`);
  }

  const result = await response.json();
  console.log('Backend registered:', result);
}

// 使用例
const frontendURL = 'https://your-frontend.pages.dev';
const backendURL = process.env.BACKEND_URL!; // Cloudflare TunnelのURL
const secret = process.env.FRONTEND_SECRET!;

registerBackend(frontendURL, backendURL, secret)
  .then(() => console.log('Registration successful'))
  .catch(err => {
    console.error('Registration failed:', err);
    process.exit(1);
  });
```

### curlでのテスト

```bash
# 開発環境（デフォルトsecret使用）
curl -X POST http://localhost:8787/register-backend \
  -H "Authorization: Bearer dev-secret-123" \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:50051"}'

# 本番環境
curl -X POST https://your-frontend.pages.dev/register-backend \
  -H "Authorization: Bearer your-actual-secret" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://backend-tunnel.trycloudflare.com"}'
```

## Cloudflare Tunnel統合

Cloudflare Tunnelを使う場合、起動スクリプトで自動登録を実装できます：

```bash
#!/bin/bash

# Cloudflare Tunnel起動
cloudflared tunnel --url localhost:50051 > tunnel.log 2>&1 &
TUNNEL_PID=$!

# TunnelのURLを取得（ログから抽出）
sleep 3
TUNNEL_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' tunnel.log | head -1)

if [ -z "$TUNNEL_URL" ]; then
    echo "Failed to get tunnel URL"
    kill $TUNNEL_PID
    exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"

# フロントエンドに登録
curl -X POST https://your-frontend.pages.dev/register-backend \
  -H "Authorization: Bearer $FRONTEND_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$TUNNEL_URL\"}"

# バックエンドサーバー起動
./your-backend-server
```

## セキュリティ考慮事項

1. **Secret管理**
   - Secretは環境変数で管理
   - コードにハードコードしない
   - 定期的にローテーション

2. **HTTPS必須**
   - 本番環境では必ずHTTPSを使用
   - Cloudflare Tunnelは自動的にHTTPS

3. **登録の制限**
   - 登録エンドポイントはSecret認証必須
   - レート制限を考慮（必要に応じて）

4. **URL検証**
   - 登録されるURLが正当なものか検証
   - 必要に応じてホワイトリスト実装

## トラブルシューティング

### 「Backend URL not configured」エラー

バックエンドが登録されていません。バックエンドから `/register-backend` を呼び出してください。

### 「Unauthorized」エラー

Secretが正しくありません。以下を確認：
- Authorizationヘッダーが `Bearer YOUR_SECRET` 形式
- Secretが環境変数 `BACKEND_SECRET` と一致

### 「Invalid request」エラー

リクエストボディが正しくありません：
- Content-Typeが `application/json`
- ボディに `url` フィールドが存在

## まとめ

1. バックエンド起動時に `/register-backend` を呼び出す
2. Secret認証を使用してセキュアに登録
3. 登録後、フロントエンドのAPIリクエストは自動的にバックエンドにプロキシ
4. Cloudflare Tunnelの動的URLに完全対応
