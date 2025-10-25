# WOFF (LINE WORKS) Authentication Frontend

React + TypeScript + Vite + Cloudflare Workers フロントエンドアプリケーション。LINE WORKS OAuth 2.0認証を使用したgRPCバックエンドと統合します。

## 機能

- LINE WORKS OAuth 2.0認証フロー
- gRPC-Web (Connect) を使用したバックエンド通信
- Buf Schema Registry (BSR) からの型安全なAPI
- React Router によるルーティング
- Cloudflare Workers へのデプロイ対応

## 前提条件

- Node.js 18以上
- npm または yarn
- バックエンドサーバー ([woff_sv](https://github.com/yhonda-ohishi/woff_sv)) が実行中であること

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env`ファイルを作成（または`.env.example`をコピー）:

```bash
cp .env.example .env
```

`.env`ファイルを編集してバックエンドAPIのURLを設定:

```
VITE_API_URL=http://localhost:50051
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

アプリケーションは [http://localhost:5173](http://localhost:5173) で起動します。

## プロジェクト構造

```
src/
├── contexts/
│   └── AuthContext.tsx      # 認証コンテキストとフック
├── gen/
│   └── auth/v1/             # BSRから生成されたコード
│       ├── auth_pb.ts       # Protobuf型定義
│       └── auth_connect.ts  # Connect-Web クライアント
├── lib/
│   └── auth-client.ts       # gRPC-Web クライアント設定
├── pages/
│   ├── LoginPage.tsx        # ログインページ
│   ├── CallbackPage.tsx     # OAuth コールバックハンドラー
│   └── ProfilePage.tsx      # ユーザープロファイルページ
├── App.tsx                  # メインアプリケーション
└── main.tsx                 # エントリーポイント
```

## 使い方

### 1. ログイン

1. ブラウザで [http://localhost:5173](http://localhost:5173) を開く
2. "Login with LINE WORKS" ボタンをクリック
3. LINE WORKS認証画面でログイン
4. 認証後、プロファイルページにリダイレクトされます

### 2. プロファイル表示

認証後、以下のユーザー情報が表示されます:

- 表示名
- ユーザー名
- メールアドレス
- ユーザーID
- ドメインID
- ロール

## スクリプト

### 開発

```bash
npm run dev
```

開発サーバーを起動（HMR有効）

### ビルド

```bash
npm run build
```

本番用にビルド

### プレビュー

```bash
npm run preview
```

ビルド後のアプリケーションをプレビュー

### デプロイ

```bash
npm run deploy
```

Cloudflare Workers にデプロイ

### コード生成

BSRからProtoコードを再生成:

```bash
npx buf generate buf.build/yhonda/woff-auth
```

## API エンドポイント

### 使用しているgRPC メソッド

- `GetAuthorizationURL` - OAuth認証URLを取得
- `ExchangeCode` - 認証コードをトークンに交換
- `GetProfile` - ユーザープロファイルを取得

詳細は [woff_sv README](https://github.com/yhonda-ohishi/woff_sv) を参照

## 環境変数

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `VITE_API_URL` | バックエンドgRPC APIのURL | `http://localhost:50051` |

## セキュリティ

- OAuth stateパラメータによるCSRF保護
- アクセストークンとリフレッシュトークンをlocalStorageに保存
- 認証が必要なルートはProtectedRouteコンポーネントで保護

## トラブルシューティング

### CORSエラー

バックエンドサーバーでCORSが有効になっていることを確認してください。

### 認証エラー

1. バックエンドサーバーが起動していることを確認
2. `VITE_API_URL`が正しく設定されていることを確認
3. LINE WORKS Developer ConsoleでリダイレクトURIが正しく設定されていることを確認

### コード生成エラー

```bash
npm install --legacy-peer-deps
npx buf generate buf.build/yhonda/woff-auth
```

## 技術スタック

- **React 19** - UIライブラリ
- **TypeScript** - 型安全性
- **Vite** - ビルドツール
- **React Router** - ルーティング
- **Connect-Web** - gRPC-Web クライアント
- **Buf Schema Registry** - Protoスキーマ管理
- **Cloudflare Workers** - デプロイプラットフォーム

## ライセンス

MIT License

## 参考リンク

- [バックエンド (woff_sv)](https://github.com/yhonda-ohishi/woff_sv)
- [Buf Schema Registry](https://buf.build/yhonda/woff-auth)
- [Connect-Web Documentation](https://connectrpc.com/docs/web/getting-started)
- [LINE WORKS Developers](https://developers.worksmobile.com/)
