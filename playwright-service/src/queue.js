const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
});

// 发布任务队列
const publishQueue = new Queue('xiaohongshu-publish', { connection });

/**
 * 提交发布任务到队列
 */
async function submitPublishTask(userId, taskData) {
  const job = await publishQueue.add('publish', {
    userId,
    ...taskData
  }, {
    attempts: 3,  // 失败重试 3 次
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  });

  return {
    taskId: job.id,
    status: 'pending'
  };
}

/**
 * 获取任务状态
 */
async function getTaskStatus(taskId) {
  const job = await publishQueue.getJob(taskId);

  if (!job) {
    return { status: 'not_found' };
  }

  const state = await job.getState();
  const progress = job.progress || 0;

  // 计算队列中的位置
  let position = 0;
  if (state === 'waiting') {
    const waitingJobs = await publishQueue.getWaiting();
    position = waitingJobs.findIndex(j => j.id === taskId) + 1;
  }

  return {
    taskId: job.id,
    status: state,  // waiting, active, completed, failed
    progress,
    position,
    result: job.returnvalue,
    error: job.failedReason
  };
}

/**
 * 创建 Worker 处理任务
 */
function createWorker(browserPool, processFn) {
  const worker = new Worker('xiaohongshu-publish', async (job) => {
    const { userId, title, content, images } = job.data;

    console.log(`开始处理任务 ${job.id}, 用户: ${userId}`);

    // 从浏览器池获取实例
    const browser = await browserPool.acquire();

    try {
      // 更新进度
      await job.updateProgress(10);

      // 执行发布逻辑
      const result = await processFn(browser, { userId, title, content, images }, job);

      await job.updateProgress(100);
      console.log(`任务 ${job.id} 完成`);

      return result;
    } catch (error) {
      console.error(`任务 ${job.id} 失败:`, error);
      throw error;
    } finally {
      // 归还浏览器到池
      await browserPool.release(browser);
    }
  }, {
    connection,
    concurrency: parseInt(process.env.MAX_WORKERS) || 10
  });

  worker.on('completed', (job) => {
    console.log(`✅ 任务 ${job.id} 已完成`);
  });

  worker.on('failed', (job, err) => {
    console.log(`❌ 任务 ${job.id} 失败: ${err.message}`);
  });

  return worker;
}

module.exports = {
  publishQueue,
  submitPublishTask,
  getTaskStatus,
  createWorker
};
