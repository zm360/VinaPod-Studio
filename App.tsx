
import React, { useState, useRef, useEffect } from 'react';
import { AppStep, Host, PodcastSeries, EpisodeOutline, ScriptLine } from './types';
import { analyzeDocument, generateEpisodeScript, generatePodcastAudio, decodeAudioData, decodeBase64 } from './services/geminiService';
import { 
  Play, Pause, Download, ChevronRight, ChevronLeft, Mic, FileText, Settings, 
  Sparkles, MessageSquare, Plus, Trash2, Edit3, Clock, Smile, RotateCcw, RotateCw, Music, Headphones, CheckCircle2, AlertCircle, Info, RefreshCw
} from 'lucide-react';

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
  
  // Lưu trữ dữ liệu theo tập
  const [episodeScripts, setEpisodeScripts] = useState<Record<number, ScriptLine[]>>({});
  const [episodeAudios, setEpisodeAudios] = useState<Record<number, { b64: string, url: string, duration: number }>>({});
  const [completedEpisodes, setCompletedEpisodes] = useState<Set<number>>(new Set());

  // Single active state (để hiển thị trong Hub)
  const [script, setScript] = useState<ScriptLine[]>([]);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isScriptDirty, setIsScriptDirty] = useState(false);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const progressInterval = useRef<number | null>(null);

  // Parse "MM:SS" string to seconds
  const parseTimeToSeconds = (timeStr: string) => {
    const [m, s] = timeStr.split(':').map(Number);
    return (m || 0) * 60 + (s || 0);
  };

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
    if (extension === 'txt') return await file.text();
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
    setLoadingMessage('Gemini đang nghiên cứu tài liệu và lập kế hoạch series (Tối đa 10 tập)...');
    startProgress(95, 15000);
    try {
      const data = await analyzeDocument(documentContent, host1, host2);
      setSeries(data);
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

  // Hàm vào thẳng Hub mà không gọi AI tạo kịch bản
  const enterHubDirectly = (episode: EpisodeOutline) => {
    setActiveEpisode(episode);
    setScript(episodeScripts[episode.id] || []);
    setIsPlaying(false);
    setIsScriptDirty(false);
    
    const audioData = episodeAudios[episode.id];
    if (audioData) {
      setAudioBase64(audioData.b64);
      setAudioUrl(audioData.url);
      setDuration(audioData.duration);
      // Re-prepare buffer
      (async () => {
         if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
         const binary = decodeBase64(audioData.b64);
         const buffer = await decodeAudioData(binary, audioContextRef.current, 24000, 1);
         audioBufferRef.current = buffer;
      })();
    } else {
      setAudioBase64(null);
      setAudioUrl(null);
    }
    setCurrentTime(0);
    offsetRef.current = 0;
    setStep(AppStep.SCRIPT_EDITOR);
  };

  const prepareScript = async (episode: EpisodeOutline, isRegenerate = false) => {
    // Nếu tập đã có kịch bản và không yêu cầu tạo lại, vào thẳng Hub
    if (episodeScripts[episode.id] && !isRegenerate) {
        enterHubDirectly(episode);
        return;
    }

    setActiveEpisode(episode);
    setIsPlaying(false);
    setIsScriptDirty(false);
    setAudioBase64(null);
    setAudioUrl(null);
    setCurrentTime(0);
    offsetRef.current = 0;
    
    setLoading(true);
    setProgress(0);
    setLoadingMessage(isRegenerate ? `Đang tạo lại kịch bản chi tiết: ${episode.title}...` : `Đang biên soạn kịch bản chi tiết: ${episode.title}...`);
    startProgress(95, 12000);
    try {
      const data = await generateEpisodeScript(documentContent, episode, host1, host2, series?.title || '');
      setScript(data);
      setEpisodeScripts(prev => ({ ...prev, [episode.id]: data }));
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
    setLoadingMessage('Đang khởi tạo âm thanh và giọng nói AI... Vui lòng chờ.');
    startProgress(98, 25000);
    try {
      const b64 = await generatePodcastAudio(script, host1, host2);
      setAudioBase64(b64);
      const binary = decodeBase64(b64);
      
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const buffer = await decodeAudioData(binary, audioContextRef.current, 24000, 1);
      audioBufferRef.current = buffer;
      setDuration(buffer.duration);
      
      const blob = new Blob([binary], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      
      // Cập nhật kho lưu trữ
      if (activeEpisode) {
        setCompletedEpisodes(prev => new Set(prev).add(activeEpisode.id));
        setEpisodeAudios(prev => ({
          ...prev,
          [activeEpisode.id]: { b64, url, duration: buffer.duration }
        }));
      }
      
      setIsScriptDirty(false);
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    } catch (error) {
      alert('Lỗi tạo âm thanh');
      setLoading(false);
    }
  };

  const updatePlaybackPosition = () => {
    if (isPlaying && audioContextRef.current) {
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current + offsetRef.current;
      if (elapsed >= (audioBufferRef.current?.duration || 0)) {
        setIsPlaying(false);
        setCurrentTime(audioBufferRef.current?.duration || 0);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      } else {
        setCurrentTime(elapsed);
        animationFrameRef.current = requestAnimationFrame(updatePlaybackPosition);
      }
    }
  };

  const togglePlayback = () => {
    if (isPlaying) {
      sourceNodeRef.current?.stop();
      setIsPlaying(false);
      offsetRef.current += audioContextRef.current!.currentTime - startTimeRef.current;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    } else {
      if (!audioBufferRef.current) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(audioContextRef.current.destination);
      
      if (offsetRef.current >= audioBufferRef.current.duration) offsetRef.current = 0;
      
      source.start(0, offsetRef.current);
      sourceNodeRef.current = source;
      startTimeRef.current = audioContextRef.current.currentTime;
      setIsPlaying(true);
      animationFrameRef.current = requestAnimationFrame(updatePlaybackPosition);
    }
  };

  const skipTime = (seconds: number) => {
    const wasPlaying = isPlaying;
    if (isPlaying) {
      sourceNodeRef.current?.stop();
      setIsPlaying(false);
      offsetRef.current += audioContextRef.current!.currentTime - startTimeRef.current;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    
    let newOffset = offsetRef.current + seconds;
    if (newOffset < 0) newOffset = 0;
    if (newOffset > (audioBufferRef.current?.duration || 0)) newOffset = audioBufferRef.current?.duration || 0;
    
    offsetRef.current = newOffset;
    setCurrentTime(newOffset);
    
    if (wasPlaying) {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current!;
      source.connect(audioContextRef.current.destination);
      source.start(0, newOffset);
      sourceNodeRef.current = source;
      startTimeRef.current = audioContextRef.current.currentTime;
      setIsPlaying(true);
      animationFrameRef.current = requestAnimationFrame(updatePlaybackPosition);
    }
  };

  const seekTo = (percent: number) => {
    if (!audioBufferRef.current) return;
    const wasPlaying = isPlaying;
    if (isPlaying) {
      sourceNodeRef.current?.stop();
      setIsPlaying(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }

    const newOffset = audioBufferRef.current.duration * percent;
    offsetRef.current = newOffset;
    setCurrentTime(newOffset);

    if (wasPlaying) {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.start(0, newOffset);
      sourceNodeRef.current = source;
      startTimeRef.current = audioContextRef.current.currentTime;
      setIsPlaying(true);
      animationFrameRef.current = requestAnimationFrame(updatePlaybackPosition);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const updateScriptLine = (idx: number, updates: Partial<ScriptLine>) => {
    const n = [...script];
    n[idx] = { ...n[idx], ...updates };
    setScript(n);
    setIsScriptDirty(true);
    // Đồng bộ lại vào kho lưu trữ tập
    if (activeEpisode) {
        setEpisodeScripts(prev => ({ ...prev, [activeEpisode.id]: n }));
    }
  };

  const getActiveScriptIndex = () => {
    for (let i = script.length - 1; i >= 0; i--) {
      if (currentTime >= parseTimeToSeconds(script[i].time)) {
        return i;
      }
    }
    return -1;
  };

  const activeIndex = getActiveScriptIndex();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-100">
            <Mic className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">VinaPod <span className="text-indigo-600">Studio</span></h1>
        </div>
        <div className="flex gap-4">
           <button onClick={() => window.location.reload()} className="text-xs font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors">Làm mới</button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-6 relative">
        {loading && (
          <div className="fixed inset-0 bg-white/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-8">
            <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-slate-100 max-w-md w-full text-center scale-up-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <LoaderIcon className="w-10 h-10 text-indigo-600 animate-spin" />
              </div>
              <h3 className="text-3xl font-black text-slate-800 mb-2">{progress}%</h3>
              <p className="text-slate-600 font-bold mb-8 px-4 leading-tight">{loadingMessage}</p>
              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden shadow-inner">
                <div className="h-full animate-progress transition-all duration-300 rounded-full" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>
        )}

        {step === AppStep.UPLOAD && (
          <div className="bg-white rounded-[40px] shadow-xl border border-slate-200 p-20 text-center mt-10 animate-in fade-in zoom-in duration-500">
            <div className="max-w-lg mx-auto">
              <div className="bg-indigo-50 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-10 transform -rotate-3 hover:rotate-0 transition-transform cursor-pointer">
                <FileText className="text-indigo-600 w-12 h-12" />
              </div>
              <h2 className="text-4xl font-black text-slate-800 mb-6 tracking-tight">Chào mừng bạn đến với Studio Podcast AI</h2>
              <p className="text-slate-500 mb-12 text-xl leading-relaxed font-medium">
                Tải lên <b>PDF, DOCX hoặc TXT</b>. Chúng tôi sẽ thiết kế một buổi talkshow chuyên nghiệp không quá 15 phút mỗi tập.
              </p>
              <label className="group relative bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 px-12 rounded-[24px] transition-all cursor-pointer flex items-center justify-center gap-4 shadow-2xl shadow-indigo-100 active:scale-95">
                <Plus className="w-7 h-7 group-hover:rotate-90 transition-transform" />
                <span className="text-xl">Bắt đầu sản xuất ngay</span>
                <input type="file" accept=".txt,.pdf,.docx" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        )}

        {step === AppStep.HOST_SETUP && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
             <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Đội ngũ sản xuất</h2>
                <p className="text-slate-400 font-bold text-sm uppercase">Thiết lập danh tính cho Podcast</p>
              </div>
              <button onClick={() => setStep(AppStep.UPLOAD)} className="text-slate-400 hover:text-slate-600 font-bold flex items-center gap-2">
                <ChevronLeft className="w-5 h-5" /> Quay lại
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {[
                { label: 'Host Chính', host: host1, setter: setHost1, icon: '🎙️', color: 'indigo' },
                { label: 'Host Khách', host: host2, setter: setHost2, icon: '🎧', color: 'emerald' }
              ].map((item, idx) => (
                <div key={idx} className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200 group hover:border-indigo-200 transition-all">
                  <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">{item.icon}</div>
                  <h3 className="text-2xl font-black text-slate-800 mb-8">{item.label}</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="text-xs font-black uppercase text-slate-400 mb-2 block tracking-widest">Tên hiển thị</label>
                      <input className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-50 outline-none font-bold bg-slate-50 text-slate-950 placeholder:text-slate-300" placeholder="Nhập tên host..." value={item.host.name} onChange={e=>item.setter({...item.host, name:e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-black uppercase text-slate-400 mb-2 block tracking-widest">Cá tính nhân vật</label>
                      <textarea className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-50 outline-none h-28 font-bold bg-slate-50 text-slate-950 leading-relaxed placeholder:text-slate-300" placeholder="Mô tả phong cách nói chuyện..." value={item.host.personality} onChange={e=>item.setter({...item.host, personality:e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-black uppercase text-slate-400 mb-2 block tracking-widest">Giọng nói AI</label>
                      <select className="w-full p-4 rounded-2xl border border-slate-200 outline-none appearance-none bg-slate-900 font-black text-white cursor-pointer hover:bg-black transition-colors" value={item.host.voice} onChange={e=>item.setter({...item.host, voice:e.target.value as any})}>
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
            <button onClick={startAnalysis} className="w-full bg-slate-900 hover:bg-black text-white font-black py-6 rounded-[24px] flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95 group">
              <span className="text-xl">TIẾN HÀNH PHÂN TÍCH TÀI LIỆU</span>
              <ChevronRight className="w-7 h-7 group-hover:translate-x-2 transition-transform" />
            </button>
          </div>
        )}

        {step === AppStep.SERIES_PLAN && series && (
          <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-right-10 duration-700">
            {/* Usage Info Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <Info className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">GIỚI HẠN TẠO TẬP</p>
                  <p className="text-lg font-black text-slate-800">{series.episodes.length} / 10 tập</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Thời lượng tối đa</p>
                  <p className="text-lg font-black text-slate-800">15 Phút / Tập</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Đã hoàn thành</p>
                  <p className="text-lg font-black text-slate-800">{completedEpisodes.size} / {series.episodes.length} tập</p>
                </div>
              </div>
            </div>

            <div className="bg-indigo-950 text-white p-12 rounded-[48px] shadow-2xl relative overflow-hidden border-b-8 border-indigo-600">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="bg-indigo-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">Series Podcast</span>
                </div>
                <h2 className="text-5xl font-black mb-6 tracking-tighter">{series.title}</h2>
                <p className="text-indigo-200 text-xl max-w-3xl leading-relaxed font-medium">{series.description}</p>
              </div>
              <Music className="absolute -bottom-10 -right-10 text-indigo-800 w-64 h-64 opacity-30" />
            </div>

            <div className="grid gap-6">
              <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3 px-2">
                <Headphones className="w-7 h-7 text-indigo-600" />
                Cấu trúc các tập thảo luận
              </h3>
              {series.episodes.map((ep, i) => {
                const isFinished = completedEpisodes.has(ep.id);
                const hasScript = !!episodeScripts[ep.id];
                return (
                  <div key={i} className={`bg-white p-8 rounded-[32px] border ${isFinished ? 'border-emerald-200 bg-emerald-50/10' : 'border-slate-200'} flex flex-col md:flex-row items-start md:items-center justify-between gap-8 hover:border-indigo-400 transition-all hover:shadow-2xl group relative overflow-hidden`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <span className="bg-indigo-50 text-indigo-600 px-4 py-1.5 rounded-2xl text-sm font-black uppercase">TẬP {ep.id}</span>
                        <div className="flex items-center gap-1.5 text-slate-400 font-bold">
                          <Clock className="w-4 h-4" />
                          <span>{ep.durationEstimate}</span>
                        </div>
                        {isFinished && (
                          <div className="flex items-center gap-1 text-emerald-600 font-black text-xs uppercase tracking-widest">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Đã có AUDIO</span>
                          </div>
                        )}
                        {hasScript && !isFinished && (
                          <div className="flex items-center gap-1 text-amber-600 font-black text-xs uppercase tracking-widest">
                            <FileText className="w-4 h-4" />
                            <span>Đã có kịch bản</span>
                          </div>
                        )}
                      </div>
                      <h4 className="text-2xl font-black text-slate-800 mb-3 group-hover:text-indigo-600 transition-colors">{ep.title}</h4>
                      <p className="text-slate-500 font-medium leading-relaxed">{ep.summary}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        {hasScript ? (
                            <>
                                <button onClick={() => enterHubDirectly(ep)} className="bg-white border-2 border-indigo-600 text-indigo-600 font-black py-4 px-8 rounded-[20px] hover:bg-indigo-50 transition-all whitespace-nowrap active:scale-95 flex items-center gap-2">
                                    <Edit3 className="w-5 h-5" /> CHỈNH SỬA HUB
                                </button>
                                <button onClick={() => prepareScript(ep, true)} className="bg-slate-100 text-slate-600 font-black py-4 px-6 rounded-[20px] hover:bg-slate-200 transition-all whitespace-nowrap active:scale-95 flex items-center gap-2" title="Tạo lại kịch bản bằng AI">
                                    <RefreshCw className="w-4 h-4" /> TẠO LẠI
                                </button>
                            </>
                        ) : (
                            <button onClick={() => prepareScript(ep)} className="bg-indigo-600 text-white font-black py-5 px-10 rounded-[20px] hover:bg-indigo-700 transition-all whitespace-nowrap active:scale-95 shadow-xl shadow-indigo-100 flex items-center gap-2">
                                BIÊN SOẠN & SẢN XUẤT
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === AppStep.SCRIPT_EDITOR && (
          <div className="space-y-8 pb-32 animate-in slide-in-from-bottom-10 duration-700">
            {/* Production Header Hub */}
            <div className="bg-white/90 backdrop-blur-xl p-8 rounded-[40px] border border-slate-200 sticky top-24 z-40 shadow-xl">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-indigo-600 font-black text-sm uppercase tracking-widest">Trang Quản lý Tổng quan</span>
                  </div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">{activeEpisode?.title}</h2>
                  <p className="text-slate-400 font-bold flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Thời lượng mục tiêu: 15:00
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                  {!audioBase64 || isScriptDirty ? (
                    <button onClick={generateAudio} className="w-full sm:w-auto bg-indigo-600 text-white px-10 py-5 rounded-[20px] font-black shadow-2xl shadow-indigo-200 hover:bg-indigo-700 flex items-center justify-center gap-3 transition-all active:scale-95 ring-4 ring-indigo-100">
                      <Sparkles className="w-6 h-6" /> {isScriptDirty ? 'KHỞI TẠO LẠI ÂM THANH' : 'KHỞI TẠO ÂM THANH'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-6 py-4 rounded-2xl border border-emerald-100 font-black text-sm">
                      <CheckCircle2 className="w-5 h-5" /> FILE AUDIO HOÀN TẤT
                    </div>
                  )}
                  <button onClick={() => setStep(AppStep.SERIES_PLAN)} className="w-full sm:w-auto bg-white border border-slate-200 px-8 py-5 rounded-[20px] font-black text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                    <ChevronLeft className="w-5 h-5" /> THOÁT HUB
                  </button>
                </div>
              </div>

              {/* Integrated Audio Player */}
              {audioBase64 && (
                <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col gap-6 animate-in slide-in-from-top-4 duration-500">
                   <div className="flex items-center justify-between text-sm font-black text-indigo-600 uppercase tracking-widest px-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xl tabular-nums">{formatTime(currentTime)}</span>
                        <span className="text-slate-300">/</span>
                        <span className="text-slate-400">{formatTime(duration)}</span>
                    </div>
                    {isScriptDirty && (
                        <div className="flex items-center gap-2 text-amber-600 animate-pulse">
                            <AlertCircle className="w-4 h-4" />
                            NỘI DUNG ĐÃ THAY ĐỔI - CẦN CẬP NHẬT ÂM THANH
                        </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div 
                    className="relative group h-4 bg-slate-100 rounded-full cursor-pointer overflow-hidden shadow-inner"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percent = x / rect.width;
                      seekTo(percent);
                    }}
                  >
                    <div 
                      className="absolute left-0 top-0 h-full bg-indigo-600 flex items-center justify-end" 
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                    >
                      <div className="w-3 h-3 bg-white rounded-full mr-1 shadow-sm"></div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-8">
                    <button onClick={() => skipTime(-10)} className="p-4 text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 rounded-2xl border border-slate-100" title="Lùi 10s">
                      <RotateCcw className="w-7 h-7" />
                    </button>
                    <button onClick={togglePlayback} className="w-20 h-20 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-100 transition-all active:scale-90">
                      {isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current translate-x-1" />}
                    </button>
                    <button onClick={() => skipTime(10)} className="p-4 text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 rounded-2xl border border-slate-100" title="Tiến 10s">
                      <RotateCw className="w-7 h-7" />
                    </button>

                    <div className="flex items-center gap-3">
                       {audioUrl && (
                        <>
                          <a href={audioUrl} download={`${activeEpisode?.title}.mp3`} className="flex items-center gap-2 bg-slate-800 text-white px-6 py-4 rounded-2xl font-black text-xs hover:bg-black transition-all">
                            <Download className="w-4 h-4" /> MP3
                          </a>
                          <a href={audioUrl} download={`${activeEpisode?.title}.m4a`} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-6 py-4 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all">
                            <Download className="w-4 h-4" /> M4A
                          </a>
                        </>
                       )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Script Table Management */}
            <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <FileText className="w-6 h-6 text-indigo-600" />
                  Biên tập chi tiết lời thoại
                </h3>
                <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase">
                  <AlertCircle className="w-4 h-4" />
                  Tự động đồng bộ với Audio Player
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 w-28"><Clock className="w-4 h-4 inline mr-2"/>Mốc giờ</th>
                      <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 w-56">Người nói</th>
                      <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Nội dung thoại (Talk Content)</th>
                      <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 w-44"><Smile className="w-4 h-4 inline mr-2"/>Trạng thái</th>
                      <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {script.map((line, idx) => {
                      const isActive = activeIndex === idx;
                      return (
                        <tr key={idx} className={`transition-all group ${isActive ? 'bg-indigo-50/80 ring-2 ring-indigo-500 ring-inset' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')} hover:bg-indigo-50/40 relative`}>
                          <td className="p-6 align-top">
                            <input className={`bg-transparent font-black outline-none w-full text-lg ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} value={line.time} onChange={e=>{
                              updateScriptLine(idx, { time: e.target.value });
                            }} />
                          </td>
                          <td className="p-6 align-top">
                            <div className="flex flex-col gap-2">
                              <select 
                                className={`p-2 rounded-xl border border-slate-200 outline-none font-black text-xs uppercase shadow-sm ${line.speaker === host1.name ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}`}
                                value={line.speaker}
                                onChange={(e) => {
                                  updateScriptLine(idx, { speaker: e.target.value });
                                }}
                              >
                                <option value={host1.name}>{host1.name}</option>
                                <option value={host2.name}>{host2.name}</option>
                              </select>
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] text-white ${line.speaker === host1.name ? 'bg-indigo-400' : 'bg-emerald-400'}`}>{line.speaker[0]}</div>
                                <span className="font-black text-slate-500 text-[10px] tracking-tight truncate max-w-[80px]">{line.speaker}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-6">
                            <textarea 
                              className={`w-full bg-transparent border-none focus:ring-0 p-0 resize-none overflow-hidden leading-relaxed font-bold text-lg ${isActive ? 'text-indigo-900' : 'text-slate-700'}`} 
                              rows={Math.ceil(line.text.length/50) || 1}
                              value={line.text}
                              onChange={e=>{
                                updateScriptLine(idx, { text: e.target.value });
                              }}
                            />
                            {isActive && isPlaying && (
                                <div className="mt-2 flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce delay-0"></span>
                                    <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce delay-75"></span>
                                    <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce delay-150"></span>
                                </div>
                            )}
                          </td>
                          <td className="p-6 align-top">
                            <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center gap-2 shadow-sm">
                               <input className="w-full bg-transparent text-xs font-black text-slate-500 outline-none focus:text-indigo-600 uppercase" value={line.emotion} onChange={e=>{
                                 updateScriptLine(idx, { emotion: e.target.value });
                               }} />
                            </div>
                          </td>
                          <td className="p-6 align-top text-right">
                            <button onClick={()=>{
                                const n = script.filter((_,i)=>i!==idx);
                                setScript(n);
                                setIsScriptDirty(true);
                                if (activeEpisode) setEpisodeScripts(prev => ({ ...prev, [activeEpisode.id]: n }));
                            }} className="text-slate-300 hover:text-red-500 p-2 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-5 h-5"/></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button onClick={()=>{
                  const n = [...script, {time: formatTime(currentTime), speaker: host1.name, text: 'Nội dung bổ sung...', emotion: 'Tự nhiên'}];
                  setScript(n);
                  setIsScriptDirty(true);
                  if (activeEpisode) setEpisodeScripts(prev => ({ ...prev, [activeEpisode.id]: n }));
              }} className="w-full p-8 text-indigo-600 hover:bg-indigo-50 font-black flex items-center justify-center gap-3 border-t border-slate-100 transition-all uppercase tracking-widest text-sm">
                <Plus className="w-6 h-6" /> THÊM LỜI THOẠI MỚI TẠI VỊ TRÍ NÀI
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-100 py-12 text-center mt-20">
        <div className="max-w-xl mx-auto px-6">
           <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em] mb-4">VinaPod Studio © 2025 • High-End Podcast Engine</p>
           <div className="h-1 w-20 bg-indigo-100 mx-auto rounded-full"></div>
        </div>
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
