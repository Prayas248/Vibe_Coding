import { AiService } from './src/services/ai.service.js';
import 'dotenv/config.js';

async function test() {
  console.log('--- Testing AI Service ---');
  console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'Set' : 'Not Set');
  console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Set' : 'Not Set');

  const abstract = "This is a test abstract about artificial intelligence and neural networks. We propose a new architecture for sequence transduction.";
  
  try {
    const features = await AiService.extractFeatures(abstract);
    console.log('Features extracted:', JSON.stringify(features, null, 2));
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
