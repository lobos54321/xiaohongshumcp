
process.env.COOKIE_ENCRYPTION_KEY = '4WU7H8Vb36M2NJ90BaR5fSGPKxAmgCo1_ENCRYPT';

import { AutoContentManager } from './dist/autoContentManager.js';
import { CookieManager } from './dist/cookieManager.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock dependencies
const mockSupabase = {
    storage: {
        from: () => ({
            upload: async () => ({ data: { path: 'mock-path' }, error: null }),
            getPublicUrl: () => ({ data: { publicUrl: 'http://mock-url' } }),
            remove: async () => ({ data: [], error: null })
        })
    },
    from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: {}, error: null }) }) }),
        insert: async () => ({ error: null }),
        update: async () => ({ error: null })
    })
};

async function runTest() {
    const userId = 'user_9dee489189a644ee8fe869097846e97d_prome';
    const taskId = '1'; // Using the first task from the JSON file

    console.log(`🚀 Starting manual publish test for user: ${userId}, task: ${taskId}`);

    // Initialize AutoContentManager
    const autoContentManager = new AutoContentManager(mockSupabase);

    // Manually load the plan to ensure it's in memory
    const dataPath = path.join(process.cwd(), 'data', 'auto-content', `${userId}.json`);
    if (fs.existsSync(dataPath)) {
        const content = fs.readFileSync(dataPath, 'utf-8');
        const data = JSON.parse(content);
        // Access private property for test
        // Structure matches ContentPlan interface: { strategy, weeklyPlan, dailyTasks }
        if (data.contentPlan) {
            autoContentManager.contentPlans.set(userId, data.contentPlan);
        } else {
            // Fallback for older format if any
            autoContentManager.contentPlans.set(userId, {
                weeklyPlan: data.plan,
                dailyTasks: data.plan?.tasks || [],
                strategy: {}
            });
        }
        console.log('✅ Loaded weekly plan into memory');
    } else {
        console.error('❌ User data file not found');
        return;
    }

    try {
        console.log('🔄 Triggering startPublishJob...');
        // Call the publish method
        await autoContentManager.startPublishJob(userId, taskId);
        console.log('✅ startPublishJob called successfully');
    } catch (error) {
        console.error('❌ Error during publish test:', error);
    }
}

runTest().catch(console.error);
