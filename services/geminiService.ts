
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { Host, EpisodeOutline, ScriptLine, PodcastSeries } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const analyzeDocument = async (content: string, host1: Host, host2: Host): Promise<PodcastSeries> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Hãy phân tích tài liệu sau và thiết kế một series podcast thảo luận chuyên sâu.
    Chủ trì bởi: ${host1.name} và ${host2.name}.
    YÊU CẦU QUAN TRỌNG: 
    1. Chia tài liệu thành các tập thảo luận logic. 
    2. CỐ GẮNG TẠO TỐI ĐA 10 TẬP (nếu nội dung tài liệu đủ phong phú).
    3. Mỗi tập thảo luận chi tiết nhưng KHÔNG VƯỢT QUÁ 15 PHÚT.
    Nội dung tài liệu: ${content.substring(0, 15000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          episodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                durationEstimate: { type: Type.STRING, description: "Thời lượng ước tính, tối đa 15:00" }
              },
              required: ["id", "title", "summary", "durationEstimate"]
            }
          }
        },
        required: ["title", "description", "episodes"]
      }
    }
  });
  
  return JSON.parse(response.text);
};

export const generateEpisodeScript = async (
  docContent: string, 
  episode: EpisodeOutline, 
  host1: Host, 
  host2: Host,
  seriesContext: string
): Promise<ScriptLine[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Viết kịch bản podcast chi tiết cho tập "${episode.title}" thuộc series "${seriesContext}".
    Dựa trên tài liệu: ${docContent.substring(0, 10000)}.
    
    Yêu cầu:
    1. Thời lượng kịch bản khi nói ra phải nằm trong khoảng 10-15 phút.
    2. Định dạng bảng kịch bản:
       - 'time': Mốc thời gian (00:00, 00:15, ...).
       - 'speaker': ${host1.name} hoặc ${host2.name}.
       - 'text': Tiếng Việt tự nhiên, đối thoại sinh động.
       - 'emotion': Trạng thái giọng nói.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            time: { type: Type.STRING },
            speaker: { type: Type.STRING },
            text: { type: Type.STRING },
            emotion: { type: Type.STRING }
          },
          required: ["time", "speaker", "text", "emotion"]
        }
      }
    }
  });

  return JSON.parse(response.text);
};

export const generatePodcastAudio = async (script: ScriptLine[], host1: Host, host2: Host): Promise<string> => {
  const prompt = `Chuyển kịch bản podcast này thành âm thanh chất lượng cao. Đảm bảo tốc độ nói vừa phải, truyền cảm:
  ${script.map(line => `${line.speaker} [${line.emotion}]: ${line.text}`).join('\n')}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: host1.name,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: host1.voice } }
            },
            {
              speaker: host2.name,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: host2.voice } }
            }
          ]
        }
      }
    }
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
};
