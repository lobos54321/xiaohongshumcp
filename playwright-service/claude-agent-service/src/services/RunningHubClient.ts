/**
 * RunningHub Client
 * 
 * 对接 RunningHub 数字人视频生成 API
 * 
 * 工作流程：
 * 1. 用户上传数字人照片 + 语音 → RunningHub
 * 2. RunningHub 生成数字人视频
 * 3. 返回视频 URL
 * 
 * API 文档：https://www.runninghub.cn/runninghub-api-doc-cn/api-279098421
 */

const RUNNINGHUB_BASE_URL = 'https://www.runninghub.cn';

// 工作流 ID
const AVATAR_VIDEO_WEBAPP_ID = '1958162038503649281';  // 数字人视频生成
const INDEX_TTS_WEBAPP_ID = '1965684535247650818';     // Index TTS 语音克隆

export interface RunningHubConfig {
    apiKey: string;
    webappId?: string;
}

export interface NodeInfo {
    nodeId: string;
    fieldName: string;
    fieldValue: string;
    description?: string;
}

export interface RunningHubTaskRequest {
    webappId: string;
    apiKey: string;
    nodeInfoList: NodeInfo[];
}

export interface RunningHubTaskResponse {
    code: number;
    msg: string;
    data: {
        netWssUrl: string;
        taskId: string;
        clientId: string;
        taskStatus: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'QUEUED';
        promptTips: string;
    };
}

export interface RunningHubTaskResult {
    code: number;
    msg: string;
    data: {
        taskId: string;
        taskStatus: string;
        fileUrl?: string;
        outputs?: Array<{
            nodeId: string;
            fileName: string;
            fileUrl: string;
            fileType: string;
        }>;
    };
}

export interface AvatarVideoParams {
    imageUrl: string;       // 数字人照片 URL 或文件名
    audioUrl: string;       // 语音音频 URL 或文件名
    audioStartTime?: number; // 音频开始时间（秒），默认 0
    audioEndTime?: number;   // 音频结束时间（秒）
}

export interface VoiceCloneParams {
    cloneAudioUrl: string;   // 克隆音频 URL 或文件名
    text: string;            // 要读的文本
    emotion?: string;        // 情感描述: "害羞的", "兴奋的", "严肃的" 等
}

export class RunningHubClient {
    private apiKey: string;
    private webappId: string;

    constructor(config: RunningHubConfig) {
        this.apiKey = config.apiKey || process.env.RUNNINGHUB_API_KEY || '';
        this.webappId = config.webappId || AVATAR_VIDEO_WEBAPP_ID;

        if (!this.apiKey) {
            console.warn('[RunningHubClient] No API key provided, some operations may fail');
        }
    }

    /**
     * 发起数字人视频生成任务
     */
    async createAvatarVideoTask(params: AvatarVideoParams): Promise<RunningHubTaskResponse> {
        const { imageUrl, audioUrl, audioStartTime = 0, audioEndTime } = params;

        // 提取文件名（如果是完整 URL）
        const imageFileName = this.extractFileName(imageUrl);
        const audioFileName = this.extractFileName(audioUrl);

        // 计算音频结束时间（如果未提供）
        const endTime = audioEndTime ?? 60; // 默认 60 秒

        const nodeInfoList: NodeInfo[] = [
            {
                nodeId: '133',
                fieldName: 'image',
                fieldValue: imageFileName,
                description: '上传图像'
            },
            {
                nodeId: '218',
                fieldName: 'audio',
                fieldValue: audioFileName,
                description: '上传音频（音频时长= 结束时间-开始时间）'
            },
            {
                nodeId: '230',
                fieldName: 'value',
                fieldValue: String(audioStartTime),
                description: '音频-开始时间（秒）'
            },
            {
                nodeId: '231',
                fieldName: 'value',
                fieldValue: String(endTime),
                description: '音频-结束时间（秒）'
            }
        ];

        return this.runTask(nodeInfoList, AVATAR_VIDEO_WEBAPP_ID);
    }

    /**
     * 发起 Index TTS 语音克隆任务
     * 
     * 使用用户上传的克隆音频生成带情感的语音
     */
    async createVoiceCloneTask(params: VoiceCloneParams): Promise<RunningHubTaskResponse> {
        const { cloneAudioUrl, text, emotion = '' } = params;

        // 提取文件名
        const audioFileName = this.extractFileName(cloneAudioUrl);

        const nodeInfoList: NodeInfo[] = [
            {
                nodeId: '9',
                fieldName: 'audio',
                fieldValue: audioFileName,
                description: '上传克隆音频'
            },
            {
                nodeId: '6',
                fieldName: 'text',
                fieldValue: text,
                description: '上传语音文本'
            },
            {
                nodeId: '17',
                fieldName: 'text',
                fieldValue: emotion,
                description: '情感描述'
            }
        ];

        console.log('[RunningHubClient] Creating voice clone task:', {
            audioFileName,
            textLength: text.length,
            emotion
        });

        return this.runTask(nodeInfoList, INDEX_TTS_WEBAPP_ID);
    }

    /**
     * 执行 RunningHub 任务
     * @param nodeInfoList - 节点信息列表
     * @param webappId - 可选，指定工作流 ID，默认使用实例配置的 ID
     */
    async runTask(nodeInfoList: NodeInfo[], webappId?: string): Promise<RunningHubTaskResponse> {
        const effectiveWebappId = webappId || this.webappId;
        const requestBody: RunningHubTaskRequest = {
            webappId: effectiveWebappId,
            apiKey: this.apiKey,
            nodeInfoList
        };

        console.log('[RunningHubClient] Starting task:', {
            webappId: effectiveWebappId,
            apiKeyUsed: `${this.apiKey.substring(0, 5)}***`,
            nodeCount: nodeInfoList.length
        });

        const response = await fetch(`${RUNNINGHUB_BASE_URL}/task/openapi/ai-app/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`RunningHub API error: ${response.status}`);
        }

        const result = await response.json() as RunningHubTaskResponse;

        console.log('[RunningHubClient] Task created:', {
            taskId: result.data?.taskId,
            status: result.data?.taskStatus,
            msg: result.msg,
            code: result.code
        });

        return result;
    }

    /**
     * 获取任务状态和结果
     */
    async getTaskResult(taskId: string): Promise<RunningHubTaskResult> {
        const response = await fetch(`${RUNNINGHUB_BASE_URL}/task/openapi/outputs?taskId=${taskId}&apiKey=${this.apiKey}`, {
            method: 'GET',
            headers: {
                'Host': 'www.runninghub.cn'
            }
        });

        if (!response.ok) {
            throw new Error(`RunningHub get result error: ${response.status}`);
        }

        return response.json() as Promise<RunningHubTaskResult>;
    }

    /**
     * 轮询等待任务完成
     */
    async waitForTaskCompletion(
        taskId: string,
        options: { maxWaitMs?: number; pollIntervalMs?: number } = {}
    ): Promise<RunningHubTaskResult> {
        const { maxWaitMs = 10 * 60 * 1000, pollIntervalMs = 5000 } = options; // 默认最多等待 10 分钟
        const startTime = Date.now();
        let pollCount = 0;

        console.log(`[RunningHubClient] Waiting for task completion: ${taskId}, maxWait=${maxWaitMs}ms`);

        while (Date.now() - startTime < maxWaitMs) {
            pollCount++;
            const result = await this.getTaskResult(taskId);
            const elapsed = Math.round((Date.now() - startTime) / 1000);

            console.log(`[RunningHubClient] Poll #${pollCount} (${elapsed}s): taskId=${taskId}, status=${result.data?.taskStatus}, code=${result.code}, msg=${result.msg?.substring(0, 100)}`);

            if (result.data?.taskStatus === 'COMPLETED' || result.data?.taskStatus === 'SUCCESS') {
                console.log('[RunningHubClient] ✅ Task completed:', taskId);
                return result;
            }

            if (result.data?.taskStatus === 'FAILED' || result.data?.taskStatus === 'ERROR') {
                console.error('[RunningHubClient] ❌ Task failed:', result);
                throw new Error(`RunningHub task failed: ${result.msg}`);
            }

            // 等待后再次轮询
            await this.sleep(pollIntervalMs);
        }

        throw new Error(`RunningHub task timed out after ${maxWaitMs}ms`);
    }

    /**
     * 上传文件到 RunningHub
     */
    async uploadFile(file: File | Buffer, fileName: string): Promise<string> {
        const formData = new FormData();

        if (file instanceof Buffer) {
            formData.append('file', new Blob([file]), fileName);
        } else {
            formData.append('file', file, fileName);
        }
        formData.append('apiKey', this.apiKey);

        console.log(`[RunningHubClient] Uploading file: ${fileName}`);

        const response = await fetch(`${RUNNINGHUB_BASE_URL}/task/openapi/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`RunningHub upload error: ${response.status}`);
        }

        const result = await response.json() as { code?: number; msg?: string; data?: { fileName?: string; fileUrl?: string } };

        console.log(`[RunningHubClient] Upload result:`, result);

        if (result.code !== 0) {
            throw new Error(`RunningHub upload failed: ${result.msg}`);
        }

        const uploadedFileName = result.data?.fileName || '';
        console.log(`[RunningHubClient] File uploaded successfully: ${uploadedFileName}`);
        return uploadedFileName;
    }

    /**
     * 从 URL 下载文件并上传到 RunningHub
     */
    async uploadFileFromUrl(fileUrl: string): Promise<string> {
        console.log(`[RunningHubClient] Downloading file from: ${fileUrl}`);

        // 下载文件
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 提取原始文件名
        const urlParts = fileUrl.split('/');
        let fileName = urlParts[urlParts.length - 1].split('?')[0];

        // 确保文件名有效
        if (!fileName || fileName.length < 3) {
            fileName = `file_${Date.now()}.mp3`;
        }

        console.log(`[RunningHubClient] Downloaded ${buffer.length} bytes, uploading as: ${fileName}`);

        // 上传到 RunningHub
        return this.uploadFile(buffer, fileName);
    }

    /**
     * 从 URL 提取文件名
     */
    private extractFileName(url: string): string {
        if (!url) return '';

        // 如果是完整 URL，提取文件名
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const urlParts = url.split('/');
            return urlParts[urlParts.length - 1].split('?')[0];
        }

        // 如果已经是文件名，直接返回
        return url;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 默认配置的单例（需要设置环境变量 RUNNINGHUB_API_KEY）
export const runningHubClient = new RunningHubClient({
    apiKey: process.env.RUNNINGHUB_API_KEY || 'd5e5511b4b3a4133bbb76622fcdf2883'
});
