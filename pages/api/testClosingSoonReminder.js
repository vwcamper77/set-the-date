// pages/api/testClosingSoonReminder.js
import finalisePollAnnouncementTask from '../../functions/tasks/finalisePollAnnouncementTask';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    console.log('🧪 Manually triggering finalisePollAnnouncementTask...');
    
    // Run the task
    await finalisePollAnnouncementTask();
    
    res.status(200).json({ 
      message: '✅ Closing soon reminder task completed',
      note: 'Check server logs for details'
    });
  } catch (err) {
    console.error('❌ Error running task:', err);
    res.status(500).json({ 
      message: 'Failed to run task', 
      error: err.message 
    });
  }
}