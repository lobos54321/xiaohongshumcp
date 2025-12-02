
import { AutoContentManager } from './src/autoContentManager.js';
import { CookieManager } from './src/cookieManager.js';
import * as path from 'path';
import * as fs from 'fs';

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
    const autoContentManager = new AutoContentManager(mockSupabase as any);

    // Manually load the plan to ensure it's in memory
    const dataPath = path.join(process.cwd(), 'data', 'auto-content', `${userId}.json`);
    if (fs.existsSync(dataPath)) {
        const content = fs.readFileSync(dataPath, 'utf-8');
        const data = JSON.parse(content);
        // @ts-ignore - accessing private property for test
        autoContentManager.weeklyPlans.set(userId, data.plan);
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
