/**
 * Custom Anthropic HTTP Client - TypeScript version
 * 用于替代有问题的SDK
 */

import https from 'https';

interface MessageOptions {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  system?: string;
}

interface AnthropicResponse {
  model: string;
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason: string;
  stop_sequence: any;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class CustomAnthropicClient {
  private apiKey: string;
  private baseURL: string;
  private version: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseURL = 'api.anthropic.com';
    this.version = '2023-06-01';
  }

  async messages_create(options: MessageOptions): Promise<AnthropicResponse> {
    const { model, max_tokens, messages, system } = options;

    const data = JSON.stringify({
      model,
      max_tokens,
      messages,
      ...(system && { system })
    });

    const dataBuffer = Buffer.from(data, 'utf8');

    const requestOptions = {
      hostname: this.baseURL,
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-api-key': this.apiKey,
        'anthropic-version': this.version,
        'Content-Length': dataBuffer.length
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            const statusCode = res.statusCode || 500;

            if (statusCode >= 200 && statusCode < 300) {
              resolve(parsed);
            } else {
              const error = new Error(`API Error: ${statusCode} ${parsed.error?.message || responseData}`);
              (error as any).status = statusCode;
              (error as any).response = parsed;
              reject(error);
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(dataBuffer);
      req.end();
    });
  }

  // 兼容原有的API接口
  get messages() {
    return {
      create: this.messages_create.bind(this)
    };
  }
}

export default CustomAnthropicClient;