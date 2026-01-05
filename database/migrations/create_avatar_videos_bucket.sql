-- 创建 avatar-videos Storage Bucket
-- 用于永久存储数字人视频和音频文件

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatar-videos',
    'avatar-videos',
    true,  -- 公开访问（用于前端播放）
    524288000,  -- 500MB 限制
    ARRAY['video/mp4', 'video/webm', 'audio/flac', 'audio/mpeg', 'audio/wav', 'audio/mp3']
) ON CONFLICT (id) DO NOTHING;

-- Storage 策略 - 用户只能访问自己的文件
CREATE POLICY "Users can view own avatar videos" ON storage.objects
    FOR SELECT 
    USING (bucket_id = 'avatar-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own avatar videos" ON storage.objects
    FOR INSERT 
    WITH CHECK (bucket_id = 'avatar-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatar videos" ON storage.objects
    FOR DELETE 
    USING (bucket_id = 'avatar-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 服务端使用 service_role key 会自动绕过 RLS
