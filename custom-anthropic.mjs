/**
 * Custom Anthropic HTTP Client
 * 用于替代有问题的SDK
 */

import https from 'https';

export class CustomAnthropicClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'api.anthropic.com';
    this.version = '2023-06-01';
  }

  async createMessage(options) {
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

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              const error = new Error(`API Error: ${res.statusCode} ${parsed.error?.message || responseData}`);
              error.status = res.statusCode;
              error.response = parsed;
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
}

export default CustomAnthropicClient;