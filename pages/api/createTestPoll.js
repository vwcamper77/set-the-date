// pages/api/createTestPoll.js
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { 
    hoursUntilDeadline = 12, // Default: 12 hours from now
    voteCount = 1, // Default: only organizer voted
    organiserEmail = 'test@example.com'
  } = req.body;

  try {
    // Generate IDs
    const pollId = uuidv4();
    const editToken = uuidv4();
    
    // Calculate deadline
    const now = new Date();
    const deadline = new Date(now.getTime() + (hoursUntilDeadline * 60 * 60 * 1000));
    
    // Create poll data
    const pollData = {
      pollId,
      editToken,
      organiserEmail,
      organiserFirstName: 'Test User',
      eventTitle: `Test Event - Closing in ${hoursUntilDeadline}h`,
      location: 'Test Location',
      description: 'This is a test poll for the closing soon reminder',
      createdAt: serverTimestamp(),
      deadline: deadline,
      pollType: 'date_time',
      options: [],
      
      // Reminder tracking fields
      closingSoonReminderSent: false,
      postDeadlineReminderSent: false,
      lowVotesReminderCount: 0,
      
      // Not finalized
      finalDate: null,
    };

    // Create the poll
    await setDoc(doc(db, 'polls', pollId), pollData);
    
    // Create votes based on voteCount
    // First vote is always the organizer
    await setDoc(doc(db, 'polls', pollId, 'votes', 'organizer'), {
      email: organiserEmail,
      name: 'Test User',
      availability: {},
      createdAt: serverTimestamp()
    });
    
    // Add additional test votes if requested
    for (let i = 1; i < voteCount; i++) {
      await setDoc(doc(db, 'polls', pollId, 'votes', `voter${i}`), {
        email: `voter${i}@example.com`,
        name: `Test Voter ${i}`,
        availability: {},
        createdAt: serverTimestamp()
      });
    }

    res.status(200).json({ 
      message: '✅ Test poll created successfully',
      pollId,
      editToken,
      deadline: deadline.toISOString(),
      hoursUntilDeadline,
      voteCount,
      viewUrl: `https://plan.setthedate.app/results/${pollId}`,
      editUrl: `https://plan.setthedate.app/edit/${pollId}?token=${editToken}`
    });
  } catch (err) {
    console.error('❌ Error creating test poll:', err);
    res.status(500).json({ message: 'Failed to create test poll', error: err.message });
  }
}