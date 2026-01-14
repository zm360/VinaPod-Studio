
import React, { useState, useRef } from 'react';
import { AppStep, Host, PodcastSeries, EpisodeOutline, ScriptLine } from './types';
import { analyzeDocument, generateEpisodeScript, generatePodcastAudio, decodeAudioData, decodeBase64 } from './services/geminiService';
import { Play, Pause, Download, ChevronRight, ChevronLeft, Mic, FileText, Settings, Sparkles, MessageSquare, Plus, Trash2, Edit3, Clock, Smile } from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progress, setProgress] = useState(0);
  
  const [documentContent, setDocumentContent] = useState('');
  const [host1, setHost1] = useState<Host>({ name: 'Hồng Anh', personality: 'Chuyên gia điềm đạm', voice: 'Kore' });
  const [host2, setHost2] = useState<Host>({ name: 'Minh Tuấn', personality: 'Người hỏi năng động', voice: 'Puck' });
  const [series, setSeries] = useState<PodcastSeries | null>(null);
  const [activeEpisode, setActiveEpisode] = useState<EpisodeOutline | null>(null);
  const [script, setScript] = useState<ScriptLine[]>([]);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const progressInterval = useRef<number | null>(null);

  const startProgress = (target: number, duration: number = 5000) => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    const start = progress;
    const stepTime = 100;
    const increment = (target - start) / (duration / stepTime);
    let current = start;
    progressInterval.current = window.setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(progressInterval.current!);
      }
      setProgress(Math.floor(current));
    }, stepTime);
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'txt') {
      return await file.text();
    } 
    
    if (extension === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await (window as any).mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }

    if (extension === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
      }
      return fullText;
    }

    throw new Error("Định dạng tệp không hỗ trợ");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setProgress(0);
    setLoadingMessage('Đang xử lý tài liệu...');
    startProgress(100, 1500);
    try {
      const text = await extractTextFromFile(file);
      setDocumentContent(text);
      setTimeout(() => {
        setStep(AppStep.HOST_SETUP);
        setLoading(false);
      }, 1500);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Lỗi tải tệp');
      setLoading(false);
    }
  };

  const startAnalysis = async () => {
    setLoading(true);
    setProgress(0);
    setLoadingMessage('Gemini đang nghiên cứu tài liệu và lập kế hoạch...');
    startProgress(95, 20000);
    try {
      const data = await analyzeDocument(documentContent, host1, host2);
      setSeries(data); // Hiển thị mờ phía dưới
      setProgress(100);
      setTimeout(() => {
        setStep(AppStep.SERIES_PLAN);
        setLoading(false);
      }, 1000);
    } catch (error) {
      alert('Lỗi phân tích');
      setLoading(false);
    }
  };

  const prepareScript = async (episode: EpisodeOutline) => {
    setActiveEpisode(episode);
    setLoading(true);
    setProgress(0);
    setLoadingMessage(`Đang biên soạn kịch bản tập: ${episode.title}...`);
    startProgress(95, 15000);
    try {
      const data = await generateEpisodeScript(documentContent, episode, host1, host2, series?.title || '');
      setScript(data); // Hiển thị mờ phía dưới
      setProgress(100);
      setTimeout(() => {
        setStep(AppStep.SCRIPT_EDITOR);
        setLoading(false);
      }, 1000);
    } catch (error) {
      alert('Lỗi soạn kịch bản');
      setLoading(false);
    }
  };

  const generateAudio = async () => {
    setLoading(true);
    setProgress(0);
    setLoadingMessage('Đang chuyển đổi kịch bản thành giọng nói AI...');
    startProgress(98, 30000);
    try {
      const b64 = await generatePodcastAudio(script, host1, host2);
      setAudioBase64(b64);
      const binary = decodeBase64(b64);
      const blob = new Blob([binary], { type: 'audio/pcm' });
      setAudioUrl(URL.createObjectURL(blob));
      setProgress(100);
      setTimeout(() => {
        setStep(AppStep.AUDIO_GENERATION);
        setLoading(false);
      }, 1000);
    } catch (error) {
      alert('Lỗi tạo âm thanh');
      setLoading(false);
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      sourceNodeRef.current?.stop();
      setIsPlaying(false);
      return;
    }
    if (!audioBase64) return;
    if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    const ctx = audioContextRef.current;
    const binary = decodeBase64(audioBase64);
    const buffer = await decodeAudioData(binary, ctx, 24000, 1);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => setIsPlaying(false);
    source.start(0);
    sourceNodeRef.current = source;
    setIsPlaying(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-100">
            <Mic className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">VinaPod <span className="text-indigo-600">Studio</span></h1>
        </div>
        <div className="hidden md:flex gap-6">
          {['Nguồn', 'Kế hoạch', 'Kịch bản', 'Xuất bản'].map((l, i) => (
            <div key={l} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${i <= Object.values(AppStep).indexOf(step) ? 'bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.5)]' : 'bg-slate-200'}`}></div>
              <span className={`text-sm font-bold ${i <= Object.values(AppStep).indexOf(step) ? 'text-slate-800' : 'text-slate-400'}`}>{l}</span>
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-6 relative">
        {loading && (
          <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[100] flex flex-col items-center justify-center p-8">
            <div className="bg-white p-10 rounded-[32px] shadow-2xl border border-slate-100 max-w-md w-full text-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <LoaderIcon className="w-10 h-10 text-indigo-600 animate-spin" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">{progress}%</h3>
              <p className="text-slate-600 font-medium mb-8">{loadingMessage}</p>
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                <div className="h-full animate-progress transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>
        )}

        {step === AppStep.UPLOAD && (
          <div className="bg-white rounded-[32px] shadow-xl border border-slate-200 p-16 text-center mt-10">
            <div className="max-w-lg mx-auto">
              <div className="bg-indigo-50 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 transform -rotate-3">
                <FileText className="text-indigo-600 w-12 h-12" />
              </div>
              <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">Tải lên tư liệu Podcast</h2>
              <p className="text-slate-500 mb-10 text-lg leading-relaxed">
                Chúng tôi hỗ trợ các định dạng <b>PDF, DOCX, TXT</b>. Gemini sẽ tự động trích xuất kiến thức để tạo ra một buổi talkshow sinh động.
              </p>
              <label className="group relative bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-5 px-10 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 active:scale-95">
                <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                <span className="text-lg">Chọn tệp tài liệu</span>
                <input type="file" accept=".txt,.pdf,.docx" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        )}

        {step === AppStep.HOST_SETUP && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
             <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Cấu hình Nhân vật</h2>
              <button onClick={() => setStep(AppStep.UPLOAD)} className="text-slate-400 hover:text-slate-600 font-bold flex items-center gap-2">
                <ChevronLeft className="w-5 h-5" /> Quay lại
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {[
                { label: 'Host Chính', host: host1, setter: setHost1, icon: '🎙️' },
                { label: 'Host Khách', host: host2, setter: setHost2, icon: '🎧' }
              ].map((item, idx) => (
                <div key={idx} className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <h3 className="text-xl font-bold text-slate-800 mb-6">{item.label}</h3>
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Tên hiển thị</label>
                      <input className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-bold" value={item.host.name} onChange={e=>item.setter({...item.host, name:e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Cá tính nhân vật</label>
                      <textarea className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none h-28" value={item.host.personality} onChange={e=>item.setter({...item.host, personality:e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Giọng nói AI</label>
                      <select className="w-full p-4 rounded-xl border border-slate-200 outline-none appearance-none bg-slate-50 font-medium" value={item.host.voice} onChange={e=>item.setter({...item.host, voice:e.target.value as any})}>
                        <option value="Kore">Kore (Nữ tính)</option>
                        <option value="Puck">Puck (Nam tính)</option>
                        <option value="Charon">Charon (Trầm ấm)</option>
                        <option value="Zephyr">Zephyr (Thanh lịch)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={startAnalysis} className="w-full bg-slate-800 hover:bg-black text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95 group">
              <span>BẮT ĐẦU PHÂN TÍCH & LÊN KHUNG</span>
              <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

        {(step === AppStep.SERIES_PLAN || (loading && series)) && (
          <div className={`space-y-8 pb-20 ${loading ? 'blur-preview' : 'animate-in fade-in duration-700'}`}>
            <div className="bg-indigo-900 text-white p-10 rounded-[40px] shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-4xl font-black mb-4 tracking-tight">{series?.title || 'Đang lập kế hoạch...'}</h2>
                <p className="text-indigo-100/70 text-lg max-w-3xl leading-relaxed">{series?.description || 'AI đang thiết kế bố cục các tập podcast dựa trên tài liệu...'}</p>
              </div>
              <Sparkles className="absolute top-10 right-10 text-indigo-400 w-24 h-24 opacity-20 rotate-12" />
            </div>
            <div className="grid gap-6">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3 px-2">
                <MessageSquare className="w-6 h-6 text-indigo-600" />
                Cấu trúc các tập thảo luận
              </h3>
              {(series?.episodes || Array(3).fill({})).map((ep: any, i) => (
                <div key={i} className="bg-white p-8 rounded-[28px] border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-indigo-300 transition-all hover:shadow-lg group">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-black uppercase">Tập {ep.id || i+1}</span>
                      <span className="text-slate-300 font-medium">{ep.durationEstimate || '--:--'}</span>
                    </div>
                    <h4 className="text-xl font-extrabold text-slate-800 mb-2">{ep.title || 'Chủ đề tập...'}</h4>
                    <p className="text-slate-500 leading-relaxed line-clamp-2">{ep.summary || 'Nội dung tóm tắt đang được chuẩn bị...'}</p>
                  </div>
                  <button onClick={() => ep.title && prepareScript(ep)} className="bg-slate-50 text-slate-800 font-black py-4 px-8 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all whitespace-nowrap active:scale-95 border border-slate-100">
                    SOẠN KỊCH BẢN
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {(step === AppStep.SCRIPT_EDITOR || (loading && script.length > 0)) && (
          <div className={`space-y-6 pb-20 ${loading ? 'blur-preview' : 'animate-in slide-in-from-bottom-10 duration-700'}`}>
            <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200 sticky top-24 z-40 flex items-center justify-between shadow-sm">
              <div>
                <h2 className="text-xl font-black text-slate-800">{activeEpisode?.title}</h2>
                <p className="text-slate-400 text-sm font-bold">Bảng biên tập kịch bản chi tiết</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(AppStep.SERIES_PLAN)} className="bg-white border border-slate-200 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button onClick={generateAudio} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2">Tạo Audio <Sparkles className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 w-24"><Clock className="w-4 h-4 inline mr-2"/>Time</th>
                    <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 w-48">Nhân vật</th>
                    <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Lời thoại</th>
                    <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 w-40"><Smile className="w-4 h-4 inline mr-2"/>Thái độ</th>
                    <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {script.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-5 align-top">
                        <input className="bg-transparent font-bold text-indigo-600 outline-none w-full" value={line.time} onChange={e=>{
                          const n = [...script]; n[idx].time = e.target.value; setScript(n);
                        }} />
                      </td>
                      <td className="p-5 align-top">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs text-white ${line.speaker === host1.name ? 'bg-indigo-500' : 'bg-emerald-500'}`}>{line.speaker[0]}</div>
                          <span className="font-extrabold text-slate-700 text-sm">{line.speaker}</span>
                        </div>
                      </td>
                      <td className="p-5">
                        <textarea 
                          className="w-full bg-transparent border-none focus:ring-0 p-0 resize-none overflow-hidden text-slate-700 leading-relaxed font-medium" 
                          rows={Math.ceil(line.text.length/60) || 1}
                          value={line.text}
                          onChange={e=>{
                            const n = [...script]; n[idx].text = e.target.value; setScript(n);
                          }}
                        />
                      </td>
                      <td className="p-5 align-top">
                        <input className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs font-bold text-slate-500 outline-none focus:border-indigo-200" value={line.emotion} onChange={e=>{
                          const n = [...script]; n[idx].emotion = e.target.value; setScript(n);
                        }} />
                      </td>
                      <td className="p-5 align-top opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={()=>setScript(script.filter((_,i)=>i!==idx))} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={()=>setScript([...script, {time: '00:00', speaker: host1.name, text: '...', emotion: 'Bình thường'}])} className="w-full p-5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 font-bold flex items-center justify-center gap-2 border-t border-slate-100">
                <Plus className="w-5 h-5" /> THÊM DÒNG KỊCH BẢN MỚI
              </button>
            </div>
          </div>
        )}

        {step === AppStep.AUDIO_GENERATION && audioBase64 && (
          <div className="max-w-2xl mx-auto py-16 animate-in zoom-in duration-700">
            <div className="bg-white p-16 rounded-[48px] shadow-2xl border border-slate-100 flex flex-col items-center text-center">
              <div className="w-28 h-28 bg-indigo-600 rounded-[32px] flex items-center justify-center mb-10 shadow-2xl shadow-indigo-200 transform -rotate-6">
                <Mic className="text-white w-14 h-14" />
              </div>
              <h2 className="text-4xl font-black text-slate-800 mb-4 tracking-tight">Xong! Bản Thu Sẵn Sàng</h2>
              <p className="text-slate-400 text-lg mb-12 font-medium">Bản podcast đã được chuyển đổi sang giọng nói AI chất lượng cao.</p>

              <div className="w-full h-1.5 bg-slate-100 rounded-full mb-12 relative overflow-hidden">
                <div className={`h-full bg-indigo-600 transition-all duration-300 ${isPlaying ? 'w-full animate-progress' : 'w-0'}`}></div>
              </div>

              <div className="flex items-center gap-8">
                <button onClick={togglePlayback} className="w-24 h-24 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-200 transition-all hover:scale-105 active:scale-95">
                  {isPlaying ? <Pause className="w-12 h-12 fill-current" /> : <Play className="w-12 h-12 fill-current translate-x-1" />}
                </button>
                {audioUrl && (
                  <a href={audioUrl} download={`${activeEpisode?.title || 'podcast'}.mp3`} className="w-20 h-20 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition-all">
                    <Download className="w-10 h-10" />
                  </a>
                )}
              </div>
              <button onClick={()=>setStep(AppStep.SERIES_PLAN)} className="mt-16 text-indigo-600 font-black hover:underline tracking-tight">Quay lại danh sách tập khác</button>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-100 py-10 text-center">
        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">VinaPod Studio © 2025 • Powered by Gemini AI</p>
      </footer>
    </div>
  );
};

const LoaderIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export default App;
