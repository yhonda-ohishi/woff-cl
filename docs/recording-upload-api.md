# 録画アップロードAPI仕様

## エンドポイント

### POST /api/recordings/upload

ビデオ通話の録画データをアップロードするエンドポイント

**重要な制限事項 (Flickr対応)**:
- 録画時間: 最大10分で自動分割
- ファイル形式: MP4形式 (WebMから変換)
- ファイルサイズ: 最大1GB (Flickrの制限)

## リクエスト

### Headers
```
Content-Type: multipart/form-data
Authorization: Bearer <token> (optional - Cookie認証も可)
```

### Body (multipart/form-data)

| フィールド名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| video | File | ✅ | 録画ファイル (MP4形式、WebMから変換済み) |
| sessionId | string | ✅ | セッションID (同じ通話を識別) |
| userId | string | ✅ | ユーザーID |
| roomId | string | ✅ | ルームID |
| timestamp | number | ✅ | 録画開始時刻 (Unix timestamp) |
| duration | number | ✅ | 録画時間（秒、最大600秒） |
| partNumber | number | ✅ | 録画パート番号 (0, 1, 2...) |

### リクエスト例

```javascript
const formData = new FormData();
formData.append('video', blob, 'recording-part0.mp4'); // MP4形式に変換済み
formData.append('sessionId', 'main-call-1761477382672');
formData.append('userId', 'Uc080660c30cdcfb01c12dea1488d45aa');
formData.append('roomId', 'main-call');
formData.append('timestamp', '1761477382672');
formData.append('duration', '120'); // 最大600秒
formData.append('partNumber', '0'); // 最初のパート

const response = await fetch('/api/recordings/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include'
});
```

## レスポンス

### 成功時 (201 Created)

```json
{
  "success": true,
  "recordingId": "rec_1761477382672_abc123",
  "sessionId": "main-call-1761477382672",
  "uploadedAt": "2025-10-26T11:16:22.682Z",
  "fileSize": 2310607,
  "duration": 120,
  "url": "https://storage.example.com/recordings/rec_1761477382672_abc123.webm"
}
```

### 重複時 (409 Conflict)

同じsessionIdで既にアップロードされている場合

```json
{
  "success": false,
  "error": "DUPLICATE_SESSION",
  "message": "この通話の録画は既にアップロード済みです",
  "sessionId": "main-call-1761477382672",
  "existingRecordingId": "rec_1761477382672_xyz789"
}
```

### 認証エラー (401 Unauthorized)

```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "認証が必要です"
}
```

### バリデーションエラー (400 Bad Request)

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "必須フィールドが不足しています",
  "missing": ["sessionId", "userId"]
}
```

### ファイルサイズエラー (413 Payload Too Large)

```json
{
  "success": false,
  "error": "FILE_TOO_LARGE",
  "message": "ファイルサイズが上限を超えています",
  "maxSize": "500MB",
  "receivedSize": "750MB"
}
```

### サーバーエラー (500 Internal Server Error)

```json
{
  "success": false,
  "error": "INTERNAL_ERROR",
  "message": "サーバーエラーが発生しました"
}
```

## ビジネスロジック

### 1. 録画の自動分割 (Flickr対応)
- **10分制限**: 録画は10分（600秒）で自動的に停止
- **自動再開**: 通話が継続中の場合、新しいパート番号で自動的に録画を再開
- **パート番号**: 0から始まる連番（part0, part1, part2...）
- **セッションID**: 同じ通話では全パートで同じsessionIdを使用

### 2. WebMからMP4への変換
- **変換タイミング**: アップロード前にブラウザ内で変換
- **変換ツール**: FFmpeg.wasm を使用
- **理由**: FlickrはMP4形式のみサポート

### 3. 重複チェック
- 同じ`sessionId`と`partNumber`の組み合わせで既にアップロードがある場合は409を返す
- クライアント側で'denied'ステータスとして保存し、ローカルバックアップは保持

### 4. ファイル保存
- 保存先: Flickr (最終的な保存先)
- ファイル名形式: `{recordingId}_part{partNumber}_{timestamp}.mp4`
- メタデータも保存（sessionId, userId, roomId, duration, partNumber, uploadedAt）

### 5. データベース保存

```sql
CREATE TABLE recordings (
  id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  room_id VARCHAR(255) NOT NULL,
  part_number INT NOT NULL DEFAULT 0,
  file_url TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  duration INT NOT NULL,
  timestamp BIGINT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  flickr_photo_id VARCHAR(255),
  INDEX idx_session_id (session_id),
  INDEX idx_user_id (user_id),
  UNIQUE KEY unique_session_part (session_id, part_number)
);
```

**スキーマ変更点**:
- `part_number`: パート番号を追加（0から開始）
- `flickr_photo_id`: Flickrにアップロードされた写真IDを保存
- `UNIQUE KEY`: `session_id`と`part_number`の組み合わせでユニーク制約

### 4. 将来の拡張: マージ機能

同じsessionIdの複数録画を1つにマージ

```
POST /api/recordings/merge
{
  "sessionId": "main-call-1761477382672"
}
```

## セキュリティ

1. **認証チェック**: ログインユーザーのみアップロード可能
2. **ユーザー検証**: リクエストのuserIdと認証ユーザーが一致するか確認
3. **ファイルサイズ制限**: 最大500MB（調整可能）
4. **ファイル形式チェック**: WebM形式のみ許可
5. **レート制限**: 同一ユーザーからのアップロードを制限（例: 5分に1回）

## クライアント側実装

### uploadRecording.ts

```typescript
export async function uploadRecordingToBackend(recording: RecordingData): Promise<void> {
  try {
    const formData = new FormData();
    formData.append('video', recording.blob, `recording-${recording.id}.webm`);
    formData.append('sessionId', recording.sessionId);
    formData.append('userId', recording.userId);
    formData.append('roomId', 'main-call'); // または動的に取得
    formData.append('timestamp', recording.timestamp.toString());
    formData.append('duration', recording.duration.toString());

    // アップロード開始
    await recordingDB.updateUploadStatus(recording.id, 'uploading');

    const response = await fetch('/api/recordings/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (response.status === 409) {
      // 重複 - サーバーが拒否
      await recordingDB.updateUploadStatus(recording.id, 'denied');
      console.log('Recording rejected as duplicate, keeping local backup');
      return;
    }

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const result = await response.json();
    await recordingDB.updateUploadStatus(recording.id, 'completed');
    console.log('Recording uploaded successfully:', result.recordingId);
  } catch (error: any) {
    await recordingDB.updateUploadStatus(recording.id, 'failed', error.message);
    throw error;
  }
}
```

## ストレージ戦略

### 採用: Flickr (最終決定)
- **ビデオサポート**: MP4形式のビデオをアップロード可能
- **制限事項**:
  - 最大ファイルサイズ: 1GB
  - 最大録画時間: 3分（無料アカウント）/ 10分（Proアカウント）
- **メリット**:
  - 既存のFlickr APIを活用可能
  - 長期保存に適している
  - アクセス制御が柔軟
- **必須対応**:
  - 10分ごとに録画を分割
  - WebMからMP4への変換

### その他のオプション（参考）

#### Cloudflare R2
- コスト効率的
- エグレス料金なし
- Workers統合が簡単

#### Cloudflare Stream
- ビデオ専用サービス
- 自動エンコーディング
- ストリーミング最適化
- コストは高め

#### AWS S3
- 汎用性が高い
- ライフサイクルポリシーで自動削除可能
- エグレス料金あり

## データ保持ポリシー

1. **クライアント側 (IndexedDB)**: 7日間
2. **サーバー側**: 30日間（調整可能）
3. **自動削除**: 保存期限が過ぎた録画を自動削除するバッチ処理

## パフォーマンス最適化

1. **チャンクアップロード**: 大きいファイルは分割してアップロード
2. **圧縮**: アップロード前にさらに圧縮（オプション）
3. **並列処理**: 複数録画を同時アップロード可能
4. **リトライロジック**: 失敗時に自動リトライ（最大3回）
5. **プログレス表示**: アップロード進捗をユーザーに表示

## モニタリング

- アップロード成功率
- 平均ファイルサイズ
- アップロード時間
- エラー率
- ストレージ使用量
