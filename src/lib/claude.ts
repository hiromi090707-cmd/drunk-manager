import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '../constants';

export async function summarizePartyConversation(
  rawText: string,
  apiKey: string,
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `以下の文章は飲み会中の録音の文字起こしです。テキストが多少乱れていても推測して、どのような話題で盛り上がったか、面白いエピソード、重要な決定事項などをわかりやすく3〜4個の箇条書きで要約してください。\n\n${rawText}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');
  return block.text;
}
