import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Activity, Brain, TrendingUp, BarChart2, Clock, Plus, Trash2, Search, List, LineChart, ArrowUp, ArrowDown, ArrowUpDown, Wand2, WifiOff, Moon, Target, Wallet, Edit2, Save, User, Link as LinkIcon, Upload, Minus, Lightbulb, PlayCircle, PauseCircle, RotateCcw, Calculator, XCircle, CircleDollarSign, Settings } from 'lucide-react';

// 1. 存储配置
const CODES_KEY = 'WUKONG_CODES_V1';
const PORTFOLIO_KEY = 'WUKONG_PORTFOLIO_V1';
// 🛡️ [V12] 保持 V12 Key 不变
const SIMULATION_KEY = 'WUKONG_SIM_V12_PRO'; 
const DEFAULT_CODES = ['hk00700', 'sh600519', 'usNVDA', 'sz000001'];

// --- 类型定义 ---
interface MinutePoint { p: number; v: number; t?: string; }
interface PortfolioItem { cost: number; shares: number; }
interface RealStock {
  id: string; code: string; name: string; price: number; changePercent: number;
  open: number; prevClose: number; high: number; low: number; volume: number;
  amount: number; turnover: number; pe: number; mktCap: number;
  minuteData: MinutePoint[]; 
  klineData: KLinePoint[]; 
}
interface KLinePoint { date: string; open: number; close: number; high: number; low: number; vol: number; }

// 模拟交易数据结构
interface SimTrade {
  id: string;
  time: string;
  price: number;
  shares: number;
  type: 'BUY' | 'SELL';
  amount: number; 
}

interface PendingOrder {
  id: string;
  time: string;
  price: number;
  shares: number;
  type: 'BUY' | 'SELL';
}

interface SimPosition {
  holding: number;   
  avgCost: number;   
  realizedPnl: number; 
  trades: SimTrade[]; 
  pending: PendingOrder[]; 
}

interface GlobalSimState {
  cash: number;           
  initialCapital: number; 
  positions: Record<string, SimPosition>; 
}

interface StrategyReport {
  t0: { 
    action: string; 
    buyPoint: number | null; 
    sellPoint: number | null; 
    desc: string; 
    strength: number; 
    strengthLevel: 'very-weak' | 'weak' | 'moderate' | 'strong' | 'very-strong';
    confidence: number; 
    executionScore: number; 
  };
  trend: { 
    position: string; 
    trend: string; 
    advice: string; 
    rsi: number;
    strength: number;
    strengthLevel: 'very-weak' | 'weak' | 'moderate' | 'strong' | 'very-strong';
  };
  holding: { pnl: number; pnlPercent: number; advice: string; } | null;
}

// 🛡️ 工具：数值安全检查
const safeNum = (val: any, fallback = 0) => {
    return (typeof val === 'number' && isFinite(val) && !isNaN(val)) ? val : fallback;
};

// 🌟 量化计算引擎
const TechIndicators = {
  calculateMA: (data: KLinePoint[], period: number) => {
    if (!data || data.length < period) return [];
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      let sum = 0; for (let j = 0; j < period; j++) sum += data[i - j].close;
      result.push(sum / period);
    }
    return result;
  },
  calculateRSI: (data: KLinePoint[], period: number = 6) => {
    if (!data || data.length <= period) return 50;
    let gains = 0, losses = 0;
    for (let i = Math.max(1, data.length - period); i < data.length; i++) {
      const change = data[i].close - (data[i-1]?.close || data[i].open);
      if (change > 0) gains += change; else losses += Math.abs(change);
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  },
  calculateMACD: (data: KLinePoint[], short = 12, long = 26, mid = 9) => {
    if (!data || data.length < long) return { dif: [], dea: [], bar: [] };
    const calcEMA = (n: number, close: number, prevEMA: number) => (close * 2 + prevEMA * (n - 1)) / (n + 1);
    let emaShort = data[0].close;
    let emaLong = data[0].close;
    let dea = 0;
    const difArr: number[] = [], deaArr: number[] = [], barArr: number[] = [];
    data.forEach((d, i) => {
      emaShort = calcEMA(short, d.close, i === 0 ? d.close : emaShort);
      emaLong = calcEMA(long, d.close, i === 0 ? d.close : emaLong);
      const dif = emaShort - emaLong;
      dea = calcEMA(mid, dif, i === 0 ? dif : dea);
      difArr.push(dif); deaArr.push(dea); barArr.push((dif - dea) * 2);
    });
    return { dif: difArr, dea: deaArr, bar: barArr };
  },
  calculatePosition: (data: KLinePoint[], period: number = 20) => {
    if (!data || data.length < period) return 50;
    const slice = data.slice(data.length - period);
    const max = Math.max(...slice.map(k => k.high));
    const min = Math.min(...slice.map(k => k.low));
    const current = slice[slice.length - 1].close;
    if (max === min) return 50;
    return ((current - min) / (max - min)) * 100;
  }
};

// 🌟 精灵信号判定引擎
const GenieEngine = {
  analyze: (s: RealStock) => {
    const isUS = s.code.startsWith('us');
    const turnoverLimit = isUS ? 0.5 : 2;
    if (s.changePercent > 2 && s.turnover > turnoverLimit) return { type: 'RISING', label: '🚀拉升', color: 'text-purple-400 bg-purple-900/20 border-purple-800' };
    if (s.changePercent > 0 && s.turnover > (turnoverLimit * 2.5)) return { type: 'HOT', label: '🔥抢筹', color: 'text-orange-400 bg-orange-900/20 border-orange-800' };
    if (s.changePercent < -3 && s.turnover > (turnoverLimit * 1.5)) return { type: 'PANIC', label: '💀出逃', color: 'text-blue-400 bg-blue-900/20 border-blue-800' };
    return null;
  }
};

const QuoteItem = ({ label, val, color = "text-gray-300" }: { label: string, val: string | number, color?: string }) => (
  <div className="flex flex-col justify-center bg-[#1a1d24] p-1 md:p-2 rounded border border-gray-800/60">
    <span className="text-[9px] text-gray-500 mb-0.5 scale-90 origin-left">{label}</span>
    <span className={`text-xs md:text-sm font-mono font-medium ${color}`}>{val}</span>
  </div>
);

// 🛡️ 修复：移除未使用的 stock 参数，解决 Vercel 报错
const SignalStrengthVisual = ({ report }: { report: StrategyReport }) => {
  if (!report || !report.t0) return null; 
  
  const strengthVal = safeNum(report.t0.strength, 0);
  const confidenceVal = safeNum(report.t0.confidence, 0);
  const executionVal = safeNum(report.t0.executionScore, 0);

  const getStrengthLevel = (value: number): { label: string; color: string } => {
    if (value < 20) return { label: '极弱', color: 'bg-gray-500' };
    if (value < 40) return { label: '较弱', color: 'bg-green-500' };
    if (value < 60) return { label: '中等', color: 'bg-yellow-500' };
    if (value < 80) return { label: '较强', color: 'bg-orange-500' };
    return { label: '很强', color: 'bg-red-500' };
  };

  const strengthLevel = getStrengthLevel(strengthVal);
  const confidenceLevel = getStrengthLevel(confidenceVal);
  const executionLevel = getStrengthLevel(executionVal);
  const compositeScore = (strengthVal * 0.4 + confidenceVal * 0.35 + executionVal * 0.25).toFixed(0);

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-gray-500 font-bold">信号分析</div>
      <div className="space-y-2">
        <div className="flex justify-between text-[9px]">
          <span className="text-gray-400">偏离强度</span>
          <span className={`${strengthLevel.color.replace('bg-', 'text-')} font-bold`}>{strengthVal.toFixed(0)}%</span>
        </div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${strengthLevel.color}`} style={{ width: `${Math.min(100, Math.max(0, strengthVal))}%` }}></div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-[9px]">
          <span className="text-gray-400">置信度</span>
          <span className={`${confidenceLevel.color.replace('bg-', 'text-')} font-bold`}>{confidenceVal.toFixed(0)}%</span>
        </div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${confidenceLevel.color}`} style={{ width: `${Math.min(100, Math.max(0, confidenceVal))}%` }}></div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-[9px]">
          <span className="text-gray-400">流动性</span>
          <span className={`${executionLevel.color.replace('bg-', 'text-')} font-bold`}>{executionVal.toFixed(0)}</span>
        </div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${executionLevel.color}`} style={{ width: `${Math.min(100, Math.max(0, executionVal))}%` }}></div>
        </div>
      </div>
      <div className="mt-2 p-2 bg-gray-800/30 rounded border border-gray-700">
        <div className="text-[9px] text-gray-500 mb-1">综合机会指数</div>
        <div className="flex justify-between items-center">
          <div className={`text-lg font-mono font-bold ${Number(compositeScore) > 60 ? 'text-green-400' : 'text-gray-400'}`}>
            {compositeScore}<span className="text-xs">%</span>
          </div>
          <div className="text-[8px] text-gray-500 text-right">综合算法评分</div>
        </div>
      </div>
    </div>
  );
};

// --- IntradayChart (V12.0 纯净版) ---
const IntradayChart = React.memo(({ data = [], prevClose, code, t0Buy, t0Sell }: { data?: MinutePoint[], prevClose: number, code: string, t0Buy?: number | null, t0Sell?: number | null }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const validData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const base = prevClose > 0 ? prevClose : (data[0].p || 1);
    return data.map(d => ({ p: (isNaN(d.p)||d.p<=0)?base:d.p, v: (isNaN(d.v)||d.v<0)?0:d.v, t: d.t || '' }));
  }, [data, prevClose]);

  const avgLine = useMemo(() => {
      if (validData.length === 0) return [];
      let sumP = 0;
      return validData.map((d, i) => { sumP += d.p; return sumP / (i + 1); });
  }, [validData]);

  const vwap = useMemo(() => {
    if (validData.length === 0) return prevClose;
    let totalPV = 0;
    let totalV = 0;
    for (const d of validData) {
      totalPV += d.p * d.v;
      totalV += d.v;
    }
    return totalV > 0 ? totalPV / totalV : prevClose;
  }, [validData, prevClose]);

  if (validData.length === 0) {
     return (
        <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2">
           {code.startsWith('us') ? <Moon size={18} className="text-blue-400 opacity-60"/> : <WifiOff size={18} className="opacity-40"/>}
           <div className="text-center">
             <div className="text-xs font-bold text-gray-500">{code.startsWith('us') ? '美股盘前/休市' : '等待开盘'}</div>
           </div>
        </div>
     );
  }

  let MAX_POINTS = 241; 
  if (code.substring(0, 2) === 'us') MAX_POINTS = 390;
  if (code.substring(0, 2) === 'hk') MAX_POINTS = 330;

  const effectivePrev = prevClose > 0 ? prevClose : validData[0].p;
  
  const prices = validData.map(d => d.p);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const maxDiff = Math.max(Math.abs(maxPrice - effectivePrev), Math.abs(minPrice - effectivePrev));
  const padding = maxDiff === 0 ? effectivePrev * 0.005 : maxDiff * 1.2; 
  const top = effectivePrev + padding;
  const bottom = effectivePrev - padding;
  const range = (top - bottom) || 1;

  const points = validData.map((d, i) => {
    const safeIndex = Math.min(i, MAX_POINTS - 1);
    const x = (safeIndex / (MAX_POINTS - 1)) * 100;
    const y = 100 - ((d.p - bottom) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const avgPoints = avgLine.map((p, i) => {
    const safeIndex = Math.min(i, MAX_POINTS - 1);
    const x = (safeIndex / (MAX_POINTS - 1)) * 100;
    const y = 100 - ((p - bottom) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const vwapY = 100 - ((vwap - bottom) / range) * 100;

  const lastPoint = validData[validData.length - 1];
  const isUp = lastPoint.p >= effectivePrev;
  const strokeColor = isUp ? '#ef4444' : '#22c55e';
  const areaColor = isUp ? '#ef4444' : '#22c55e';
  const lastXPercent = (Math.min(validData.length - 1, MAX_POINTS - 1) / (MAX_POINTS - 1)) * 100;
  const areaPoints = `0,100 ${points} ${lastXPercent},100`;
  
  let maxVol = Math.max(...validData.map(d => d.v)); if (maxVol === 0) maxVol = 1;

  const handleMove = (clientX: number, e: any) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clientX - rect.left;
    const idx = Math.round((x / rect.width) * (MAX_POINTS - 1));
    if (idx >= 0 && idx < validData.length) setHoverIdx(idx);
  };

  const hoverData = hoverIdx !== null ? validData[hoverIdx] : null;

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0c10] select-none group relative"
         style={{ touchAction: 'none' }} 
         onMouseMove={(e) => handleMove(e.clientX, e)}
         onMouseLeave={() => setHoverIdx(null)}
         onTouchStart={(e) => handleMove(e.touches[0].clientX, e)}
         onTouchMove={(e) => handleMove(e.touches[0].clientX, e)}
         onTouchEnd={() => setHoverIdx(null)}
    >
       {hoverData && (
         <div className="absolute z-30 top-2 left-1/2 -translate-x-1/2 bg-[#1c1f26]/90 border border-gray-700 px-2 py-1 rounded flex gap-2 text-[10px] font-mono shadow-lg pointer-events-none whitespace-nowrap">
            <span className="text-gray-400">{hoverData.t}</span>
            <span className={hoverData.p >= effectivePrev ? 'text-red-400' : 'text-green-400'}>{hoverData.p.toFixed(2)}</span>
            <span className="text-yellow-500">均: {avgLine[hoverIdx!]?.toFixed(2)}</span>
            <span className="text-purple-400">VWAP: {vwap.toFixed(2)}</span>
         </div>
       )}

       <div className="relative h-[70%] border-b border-gray-800/80 box-border">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
             <defs>
               <linearGradient id={`grad-${isUp?'up':'down'}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={areaColor} stopOpacity="0.15"/>
                  <stop offset="100%" stopColor={areaColor} stopOpacity="0.0"/>
               </linearGradient>
             </defs>
             <line x1="0" y1={50} x2="100" y2={50} stroke="#4b5563" strokeWidth="0.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.5" />
             {/* VWAP Line */}
             <line x1="0" y1={vwapY} x2="100" y2={vwapY} stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" opacity="0.7" />
             {/* T0 Buy/Sell Lines */}
             {t0Buy && t0Buy > bottom && t0Buy < top && <line x1="0" y1={100 - ((t0Buy - bottom) / range) * 100} x2="100" y2={100 - ((t0Buy - bottom) / range) * 100} stroke="#10b981" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" opacity="0.6" />}
             {t0Sell && t0Sell > bottom && t0Sell < top && <line x1="0" y1={100 - ((t0Sell - bottom) / range) * 100} x2="100" y2={100 - ((t0Sell - bottom) / range) * 100} stroke="#ef4444" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" opacity="0.6" />}
             
             <polygon points={areaPoints} fill={`url(#grad-${isUp?'up':'down'})`} />
             <polyline points={points} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>
             <polyline points={avgPoints} fill="none" stroke="#eab308" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity="0.8"/>
             {hoverIdx !== null && (
               <g>
                  <line x1={(hoverIdx / (MAX_POINTS - 1)) * 100} y1="0" x2={(hoverIdx / (MAX_POINTS - 1)) * 100} y2="100" stroke="#60a5fa" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>
                  <line x1="0" y1={100 - ((hoverData!.p - bottom) / range) * 100} x2="100" y2={100 - ((hoverData!.p - bottom) / range) * 100} stroke="#60a5fa" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>
               </g>
             )}
          </svg>
       </div>
       <div className="relative h-[30%] pt-1 bg-[#0b0c10]">
          <svg className="w-full h-full overflow-hidden" viewBox="0 0 100 100" preserveAspectRatio="none">
             {validData.map((d, i) => {
               const safeIndex = Math.min(i, MAX_POINTS - 1);
               const prevP = i > 0 ? validData[i-1].p : effectivePrev;
               const barColor = d.p > prevP ? '#ef4444' : d.p < prevP ? '#22c55e' : '#6b7280';
               const barHeight = (d.v / maxVol) * 100;
               const x = (safeIndex / (MAX_POINTS - 1)) * 100;
               const w = (100 / MAX_POINTS) * 0.6; 
               return ( <rect key={i} x={x} y={100 - barHeight} width={w} height={barHeight} fill={barColor} opacity={hoverIdx === i ? 1 : 0.8} /> )
             })}
          </svg>
       </div>
    </div>
  );
});

// --- CandleChart (保持不变) ---
const CandleChart = React.memo(({ data = [], subChartMode, setSubChartMode }: { data?: KLinePoint[], subChartMode: 'VOL' | 'MACD' | 'RSI', setSubChartMode: any }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const validData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.filter(d => d.open > 0 && d.close > 0);
  }, [data]);

  const ma5 = useMemo(() => TechIndicators.calculateMA(validData, 5), [validData]);
  const ma10 = useMemo(() => TechIndicators.calculateMA(validData, 10), [validData]);
  const ma20 = useMemo(() => TechIndicators.calculateMA(validData, 20), [validData]);
  const macd = useMemo(() => TechIndicators.calculateMACD(validData), [validData]);
  
  const rsi = useMemo(() => {
    if (validData.length < 6) return [];
    const result: (number|null)[] = [];
    for(let k=0; k<6; k++) result.push(null);
    for (let i = 6; i < validData.length; i++) {
      const slice = validData.slice(0, i + 1); 
      result.push(TechIndicators.calculateRSI(slice));
    }
    return result;
  }, [validData]);

  if (validData.length === 0) return <div className="h-full flex items-center justify-center text-gray-700 text-xs">无K线数据</div>;

  const displayCount = 60;
  const safeStart = Math.max(0, validData.length - displayCount);
  const displayData = validData.slice(safeStart);
  
  const displayMA5 = ma5.slice(safeStart);
  const displayMA10 = ma10.slice(safeStart);
  const displayMA20 = ma20.slice(safeStart);
  const displayDIF = macd.dif.slice(safeStart);
  const displayDEA = macd.dea.slice(safeStart);
  const displayMACDBar = macd.bar.slice(safeStart);
  const displayRSI = rsi.slice(safeStart);

  let max = 0, min = Infinity;
  displayData.forEach(d => { max = Math.max(max, d.high); min = Math.min(min, d.low); });
  [...displayMA5, ...displayMA10, ...displayMA20].forEach(v => { if (v) { max = Math.max(max, v); min = Math.min(min, v); }});

  const range = max - min;
  const renderMax = max + (range * 0.05);
  const renderMin = min - (range * 0.05);
  const renderRange = renderMax - renderMin || 1;
  const barWidth = 100 / displayCount;
  const gap = barWidth * 0.25;

  let maxVol = 0; displayData.forEach(d => maxVol = Math.max(maxVol, d.vol));
  let maxMACD = 0, minMACD = 0;
  [...displayDIF, ...displayDEA, ...displayMACDBar].forEach(v => { maxMACD = Math.max(maxMACD, v); minMACD = Math.min(minMACD, v); });
  const absMaxMACD = Math.max(Math.abs(maxMACD), Math.abs(minMACD));
  const macdRange = absMaxMACD * 2.2;

  const getLinePoints = (arr: (number|null)[], minY: number, rng: number, zeroAtCenter: boolean = false) => {
    return arr.map((val, i) => {
      if (val === null) return null;
      const x = i * barWidth + barWidth / 2;
      const y = zeroAtCenter ? 50 - (val / rng) * 100 : 100 - ((val - minY) / rng) * 100;
      return `${x},${y}`;
    }).filter(Boolean).join(' ');
  };

  const handleMove = (clientX: number, e: any) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clientX - rect.left;
    const idx = Math.floor((x / rect.width) * displayCount);
    if (idx >= 0 && idx < displayData.length) setHoverIdx(idx);
  };

  const activeData = hoverIdx !== null ? displayData[hoverIdx] : null;

  return (
    <div className="w-full h-full relative bg-[#0b0c10] select-none border-t border-gray-800/50 flex flex-col group"
         style={{ touchAction: 'none' }} 
         onMouseMove={(e) => handleMove(e.clientX, e)}
         onMouseLeave={() => setHoverIdx(null)}
         onTouchStart={(e) => handleMove(e.touches[0].clientX, e)}
         onTouchMove={(e) => handleMove(e.touches[0].clientX, e)}
         onTouchEnd={() => setHoverIdx(null)}
    >
       <div className="absolute top-1 left-2 z-10 flex items-center gap-2 text-[8px] font-mono bg-black/60 px-2 py-1 rounded border border-gray-800 pointer-events-auto">
          <span className="text-yellow-400">MA5</span><span className="text-cyan-400">MA10</span><span className="text-purple-400">MA20</span>
          <div className="w-[1px] bg-gray-600 mx-1 h-3"></div>
          <button onClick={(e)=>{e.stopPropagation();setSubChartMode('VOL')}} className={`px-2 py-0.5 rounded ${subChartMode==='VOL'?'text-white bg-gray-700':'text-gray-500'}`}>VOL</button>
          <button onClick={(e)=>{e.stopPropagation();setSubChartMode('MACD')}} className={`px-2 py-0.5 rounded ${subChartMode==='MACD'?'text-white bg-gray-700':'text-gray-500'}`}>MACD</button>
          <button onClick={(e)=>{e.stopPropagation();setSubChartMode('RSI')}} className={`px-2 py-0.5 rounded ${subChartMode==='RSI'?'text-white bg-gray-700':'text-gray-500'}`}>RSI</button>
       </div>
       
       {activeData && (
           <div className="absolute top-8 left-2 z-20 bg-[#1c1f26]/90 border border-gray-700 px-2 py-1 rounded text-[9px] font-mono shadow-lg pointer-events-none">
               <div className="text-gray-400 mb-0.5">{activeData.date}</div>
               <div className="flex gap-2">
                 <span className={activeData.close>activeData.open?'text-red-400':'text-green-400'}>C: {activeData.close.toFixed(2)}</span>
               </div>
           </div>
       )}

       <div className="h-[70%] relative border-b border-gray-800/50 pointer-events-none">
           <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
             {displayData.map((d, i) => {
                const isRed = d.close >= d.open;
                const color = isRed ? '#ef4444' : '#22c55e';
                const x = i * barWidth + gap/2;
                const w = barWidth - gap;
                const yHigh = 100 - ((d.high - renderMin) / renderRange) * 100;
                const yLow = 100 - ((d.low - renderMin) / renderRange) * 100;
                const yOpen = 100 - ((d.open - renderMin) / renderRange) * 100;
                const yClose = 100 - ((d.close - renderMin) / renderRange) * 100;
                let bodyY = Math.min(yOpen, yClose);
                let bodyH = Math.abs(yOpen - yClose); if (bodyH < 0.5) bodyH = 0.5;
                return (
                  <g key={i} opacity={hoverIdx !== null && hoverIdx !== i ? 0.6 : 1}>
                    <line x1={x+w/2} y1={yHigh} x2={x+w/2} y2={yLow} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke"/>
                    <rect x={x} y={bodyY} width={w} height={bodyH} fill={color} />
                  </g>
                );
             })}
             <polyline points={getLinePoints(displayMA5, renderMin, renderRange)} fill="none" stroke="#facc15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
             <polyline points={getLinePoints(displayMA10, renderMin, renderRange)} fill="none" stroke="#22d3ee" strokeWidth="1" vectorEffect="non-scaling-stroke" />
             <polyline points={getLinePoints(displayMA20, renderMin, renderRange)} fill="none" stroke="#a855f7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
             {hoverIdx !== null && <line x1={(hoverIdx * barWidth) + barWidth/2} y1="0" x2={(hoverIdx * barWidth) + barWidth/2} y2="145" stroke="#60a5fa" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
           </svg>
       </div>

       <div className="h-[30%] relative pt-1 bg-[#0b0c10] pointer-events-none">
          {subChartMode === 'VOL' ? (
             <svg className="w-full h-full overflow-hidden" viewBox="0 0 100 100" preserveAspectRatio="none">
                 {displayData.map((d, i) => {
                     const color = d.close >= d.open ? '#ef4444' : '#22c55e';
                     const h = (d.vol / maxVol) * 100;
                     const x = i * barWidth + gap/2;
                     const w = barWidth - gap;
                     return <rect key={i} x={x} y={100-h} width={w} height={h} fill={color} opacity={hoverIdx !== null && hoverIdx !== i ? 0.5 : 0.9}/>
                 })}
             </svg>
          ) : subChartMode === 'MACD' ? (
             <svg className="w-full h-full overflow-hidden" viewBox="0 0 100 100" preserveAspectRatio="none">
                 <line x1="0" y1="50" x2="100" y2="50" stroke="#374151" strokeWidth="1"/>
                 {displayMACDBar.map((val, i) => {
                     const isRed = val > 0;
                     const h = Math.abs(val / macdRange) * 100;
                     const x = i * barWidth + gap/2;
                     const w = barWidth - gap;
                     const y = val > 0 ? 50 - h : 50;
                     return <rect key={i} x={x} y={y} width={w} height={h} fill={isRed ? '#ef4444' : '#22c55e'} opacity={hoverIdx !== null && hoverIdx !== i ? 0.6 : 1}/>
                 })}
                 <polyline points={getLinePoints(displayDIF, 0, macdRange, true)} fill="none" stroke="#facc15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                 <polyline points={getLinePoints(displayDEA, 0, macdRange, true)} fill="none" stroke="#22d3ee" strokeWidth="1" vectorEffect="non-scaling-stroke" />
             </svg>
          ) : (
             <svg className="w-full h-full overflow-hidden" viewBox="0 0 100 100" preserveAspectRatio="none">
                 {/* RSI 20/80 参考线 */}
                 <line x1="0" y1="80" x2="100" y2="80" stroke="#dc2626" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>
                 <line x1="0" y1="20" x2="100" y2="20" stroke="#22c55e" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>
                 <polyline points={getLinePoints(displayRSI, 0, 100, false)} fill="none" stroke="#8b5cf6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
             </svg>
          )}
       </div>
    </div>
  );
});

// --- App ---
export default function App() {
  const [codes, setCodes] = useState<string[]>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const syncData = searchParams.get('sync');
      if (syncData) {
         try {
            const decoded = JSON.parse(atob(decodeURIComponent(syncData)));
            if (decoded && Array.isArray(decoded.codes)) return decoded.codes;
         } catch (e) { console.warn("Sync Data corrupted"); }
      }
      return JSON.parse(localStorage.getItem(CODES_KEY) || 'null') || DEFAULT_CODES;
    } catch { return DEFAULT_CODES; }
  });

  const [portfolio, setPortfolio] = useState<Record<string, PortfolioItem>>(() => {
    try { 
      const searchParams = new URLSearchParams(window.location.search);
      const syncData = searchParams.get('sync');
      if (syncData) {
         try {
            const decoded = JSON.parse(atob(decodeURIComponent(syncData)));
            if (decoded && decoded.portfolio && typeof decoded.portfolio === 'object') return decoded.portfolio;
         } catch (e) {}
      }
      return JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || '{}'); 
    } catch { return {}; }
  });
  
  // 🛡️ [安全初始化] 
  const [simState, setSimState] = useState<GlobalSimState>(() => {
    try {
        const stored = localStorage.getItem(SIMULATION_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (typeof parsed.cash === 'number' && parsed.positions) {
                Object.keys(parsed.positions).forEach(k => {
                   if (!Array.isArray(parsed.positions[k].trades)) parsed.positions[k].trades = [];
                   if (!Array.isArray(parsed.positions[k].pending)) parsed.positions[k].pending = [];
                   if (typeof parsed.positions[k].realizedPnl !== 'number') parsed.positions[k].realizedPnl = 0;
                });
                return parsed;
            }
        }
        return { cash: 1000000, initialCapital: 1000000, positions: {} };
    } catch { return { cash: 1000000, initialCapital: 1000000, positions: {} }; }
  });
  
  const [stocks, setStocks] = useState<RealStock[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [inputCode, setInputCode] = useState('');
  const [draggedCode, setDraggedCode] = useState<string | null>(null);
  const [dragOverCode, setDragOverCode] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'LIST' | 'CHART' | 'AI'>('CHART');
  const [isSorting, setIsSorting] = useState(false);
  const [isGenieMode, setIsGenieMode] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncLink, setSyncLink] = useState('');
  const [isEditingPortfolio, setIsEditingPortfolio] = useState(false);
  
  const [strategyTab, setStrategyTab] = useState<'T0' | 'TREND' | 'SIM'>('T0');
  
  const [tempCost, setTempCost] = useState('');
  const [tempShares, setTempShares] = useState('');
  const [subChartMode, setSubChartMode] = useState<'VOL'|'MACD'|'RSI'>('MACD');
  
  const [simVol, setSimVol] = useState('100'); 
  const [simPrice, setSimPrice] = useState(''); 
  const [isSettingCapital, setIsSettingCapital] = useState(false); 
  const [tempCapital, setTempCapital] = useState('');

  const requestIdRef = useRef(0);

  useEffect(() => { localStorage.setItem(CODES_KEY, JSON.stringify(codes)); }, [codes]);
  useEffect(() => { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio)); }, [portfolio]);
  useEffect(() => { localStorage.setItem(SIMULATION_KEY, JSON.stringify(simState)); }, [simState]);
  
  useEffect(() => { if (!selectedCode && codes.length > 0) setSelectedCode(codes[0]); }, [codes, selectedCode]);

  useEffect(() => {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('sync')) {
          window.history.replaceState({}, '', window.location.pathname);
      }
  }, []);

  useEffect(() => {
      if (selectedCode) {
          const p = portfolio[selectedCode];
          setTempCost(p ? p.cost.toString() : '');
          setTempShares(p ? p.shares.toString() : '');
          setIsEditingPortfolio(false);
          
          const s = stocks.find(x => x.code === selectedCode);
          if (s) setSimPrice(s.price.toFixed(2));
      }
  }, [selectedCode]);

  const generateSyncLink = () => {
      const data = { codes, portfolio };
      const str = btoa(JSON.stringify(data));
      const url = `${window.location.origin}${window.location.pathname}?sync=${encodeURIComponent(str)}`;
      setSyncLink(url);
      navigator.clipboard.writeText(url);
      setTimeout(() => {}, 2000);
  };

  const savePortfolio = () => {
      if (!selectedCode) return;
      const cost = parseFloat(tempCost);
      const shares = parseFloat(tempShares);
      if (!isNaN(cost) && !isNaN(shares)) {
          setPortfolio(prev => ({ ...prev, [selectedCode]: { cost, shares } }));
      } else {
          const next = { ...portfolio };
          delete next[selectedCode];
          setPortfolio(next);
      }
      setIsEditingPortfolio(false);
  };

  const moveStock = (index: number, direction: 'UP' | 'DOWN') => {
    const newCodes = [...codes];
    if (direction === 'UP' && index > 0) { [newCodes[index], newCodes[index - 1]] = [newCodes[index - 1], newCodes[index]]; } 
    else if (direction === 'DOWN' && index < newCodes.length - 1) { [newCodes[index], newCodes[index + 1]] = [newCodes[index + 1]] = [newCodes[index + 1], newCodes[index]]; }
    setCodes(newCodes);
  };

  const handleDragStart = (e: React.DragEvent, c: string) => {
    e.dataTransfer.setData("text/plain", c);
    e.dataTransfer.effectAllowed = "move";
    setDraggedCode(c);
  };

  const handleDrop = (e: React.DragEvent, t: string) => {
    e.preventDefault();
    if (draggedCode && draggedCode !== t) {
      const from = codes.indexOf(draggedCode), to = codes.indexOf(t);
      const n = [...codes]; n.splice(to, 0, n.splice(from, 1)[0]);
      setCodes(n);
    }
    setDraggedCode(null); setDragOverCode(null);
  };

  const fetchRealData = useCallback(async () => {
    if (codes.length === 0) return;
    
    const currentId = ++requestIdRef.current;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`/api/q=${codes.join(',')}&_t=${Date.now()}`, { signal: controller.signal }); 
      clearTimeout(timeoutId);
      
      // 🛡️ [核心修复]：拦截 HTML 响应，防止 JSON.parse 崩溃
      const buffer = await res.arrayBuffer();
      let text = '';
      try {
        text = new TextDecoder('gbk').decode(buffer);
      } catch (e) {
        text = new TextDecoder('utf-8').decode(buffer);
      }
      
      if (text.includes('<html>') || text.includes('<!DOCTYPE html>')) return;

      if (currentId !== requestIdRef.current) return;

      setStocks(prev => text.split(';').filter(l => l.trim()).map(line => {
         const parts = line.split('~');
         if (parts.length < 10) return null;
         const fullCode = line.match(/v_(.*?)=/)?.[1] || '';
         const isUS = fullCode.startsWith('us');
         const safe = (i: number) => { const n = parseFloat(parts[i]); return isNaN(n) ? 0 : n; };
         const old = prev.find(s => s.code === fullCode);
         const price = safe(3);
         const prevClose = isUS ? safe(26) : safe(4); 
         const open = safe(5);
         const effectivePrev = prevClose > 0 ? prevClose : (price > 0 ? price : open);
         return {
           id: fullCode, code: fullCode, name: parts[1],
           price: price, changePercent: safe(32), open: open, prevClose: effectivePrev, 
           high: safe(33), low: safe(34), volume: safe(6), turnover: safe(38),
           amount: safe(37), pe: safe(39), mktCap: safe(45),
           minuteData: old?.minuteData || [], klineData: old?.klineData || []
         };
      }).filter(Boolean) as RealStock[]);
    } catch (e) { 
        if ((e as Error).name !== 'AbortError') console.error("API Error", e); 
    }
  }, [codes]);

  const fetchMinute = async (code: string) => {
    if (code !== lastSelectedCodeRef.current) return;
    try {
      const res = await fetch(`/kline/appstock/app/minute/query?code=${code}&_t=${Date.now()}`);
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) return;

      const json = await res.json();
      
      if (code !== lastSelectedCodeRef.current) return;

      const arr = json?.data?.[code]?.data?.data;
      if (Array.isArray(arr)) {
        const minutePoints: MinutePoint[] = [];
        let lastTotalVol = 0;
        arr.forEach((s: string, index: number) => {
            const parts = s.split(' ');
            const p = parseFloat(parts[1]);
            const totalVol = parseFloat(parts[2]); 
            let currentVol = index === 0 ? totalVol : totalVol - lastTotalVol;
            if (currentVol < 0) currentVol = 0;
            lastTotalVol = totalVol;
            if (!isNaN(p)) minutePoints.push({ p, v: currentVol, t: parts[0] });
        });
        setStocks(p => p.map(s => s.code === code ? { ...s, minuteData: minutePoints } : s));
      } else { setStocks(p => p.map(s => s.code === code ? { ...s, minuteData: [] } : s)); }
    } catch(e) {}
  };

  const fetchKLine = async (code: string) => {
    if (code !== lastSelectedCodeRef.current) return;
    try {
      const isUS = code.startsWith('us');
      const params = isUS ? `${code},day,,,320` : `${code},day,,,320,qfq`;
      const res = await fetch(`/kline/appstock/app/fqkline/get?param=${params}&_t=${Date.now()}`);
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) return;
      
      const json = await res.json();
      
      if (code !== lastSelectedCodeRef.current) return;

      const arr = json?.data?.[code]?.qfqday || json?.data?.[code]?.day;
      if (Array.isArray(arr)) {
        const kdata = arr.map((i: any[]) => ({ date: i[0], open: parseFloat(i[1]), close: parseFloat(i[2]), high: parseFloat(i[3]), low: parseFloat(i[4]), vol: parseFloat(i[5]) }));
        setStocks(p => p.map(s => s.code === code ? { ...s, klineData: kdata } : s));
      }
    } catch(e) {}
  };

  useEffect(() => { fetchRealData(); const i = setInterval(fetchRealData, 3000); return () => clearInterval(i); }, [fetchRealData]);
  
  useEffect(() => { 
    if (selectedCode) { 
      lastSelectedCodeRef.current = selectedCode;
      setStocks(p => p.map(s => s.code === selectedCode ? { ...s, minuteData: [], klineData: [] } : s));
      fetchMinute(selectedCode); 
      fetchKLine(selectedCode); 
    } 
  }, [selectedCode]);

  const selStock = stocks.find(s => s.code === selectedCode);

  const report = useMemo((): StrategyReport | null => {
    if (!selStock) return null;
    try {
      const s = selStock;
      const kdata = s.klineData || [];
      const minute = s.minuteData || [];
      const myPos = portfolio[s.code];

      let t0Action = "观望";
      let t0Buy = null;
      let t0Sell = null;
      let t0Desc = "日内波动较小，建议静观其变。";
      
      let vwap = s.price;
      if (minute.length > 0) {
          const sumP = minute.reduce((acc, cur) => acc + cur.p, 0);
          vwap = sumP / minute.length;
      }
      
      const amplitude = s.open > 0 ? (s.high - s.low) / s.open : 0.02;
      const dynamicBand = Math.max(0.015, amplitude * 0.6);

      const dayUp = vwap * (1 + dynamicBand);
      const dayDn = vwap * (1 - dynamicBand);

      const dist = Math.abs(s.price - vwap);
      const maxDist = vwap * dynamicBand * 1.5;
      let rawStrength = Math.min(100, (dist / maxDist) * 100);
      
      let liquidityScore = Math.min(100, (s.turnover / 3) * 60 + (s.amount / 100000000) * 10); 
      if (liquidityScore < 20) liquidityScore = 20;

      let rsi = 50;
      if (kdata.length > 6) {
         rsi = TechIndicators.calculateRSI(kdata);
      }
      
      let confidence = 50;

      if (s.price < dayDn) {
          t0Action = "机会";
          t0Buy = s.price;
          t0Desc = "股价日内超跌，乖离率过大，存在反抽均线需求，激进者可现价博反弹。";
          if (rsi < 30) confidence += 30;
          else if (rsi < 45) confidence += 10;
          confidence += (rawStrength * 0.3);
      } else if (s.price > dayUp) {
          t0Action = "风险";
          t0Sell = s.price;
          t0Desc = "股价日内超涨，偏离均线过远，谨防冲高回落，建议分批止盈。";
          if (rsi > 70) confidence += 30;
          else if (rsi > 55) confidence += 10;
          confidence += (rawStrength * 0.3);
      } else {
          t0Buy = dayDn;
          t0Sell = dayUp;
          if (s.price > vwap) t0Desc = "股价运行于均线上方，属于强势震荡，持股待涨。";
          else t0Desc = "股价受制于均线压制，弱势震荡，多看少动。";
          
          rawStrength = Math.max(10, rawStrength);
          confidence = 40 + (liquidityScore * 0.2);
      }

      confidence = Math.min(100, confidence);

      let t0StrengthLevel: 'very-weak' | 'weak' | 'moderate' | 'strong' | 'very-strong' = 'moderate';
      if (rawStrength < 20) t0StrengthLevel = 'very-weak';
      else if (rawStrength < 40) t0StrengthLevel = 'weak';
      else if (rawStrength < 60) t0StrengthLevel = 'moderate';
      else if (rawStrength < 80) t0StrengthLevel = 'strong';
      else t0StrengthLevel = 'very-strong';

      let trendPos = "中位";
      let trendDir = "震荡";
      let trendAdvice = "暂无明确方向。";
      let trendStrength = 0;
      let trendStrengthLevel: 'very-weak' | 'weak' | 'moderate' | 'strong' | 'very-strong' = 'moderate';

      if (kdata.length >= 20) {
          const pos = TechIndicators.calculatePosition(kdata, 20);
          const ma20 = TechIndicators.calculateMA(kdata, 20).pop() || 0;

          if (pos < 20) trendPos = "低位";
          else if (pos > 80) trendPos = "高位";

          if (s.price > ma20) trendDir = "多头";
          else trendDir = "空头";

          let trendDev = Math.abs((s.price - ma20) / ma20) * 100;
          trendStrength = Math.min(100, trendDev * 10 + (pos > 80 || pos < 20 ? 30 : 0));

          if (trendPos === "低位") {
              trendAdvice = "股价处于近20日低位区域，下跌空间有限。即使趋势偏弱，也不宜盲目割肉，耐心等待底部企稳信号。";
          } else if (trendPos === "高位" && trendDir === "空头") {
              trendAdvice = "高位出现破位迹象，头部风险加剧，建议坚决离场规避风险。";
          } else if (trendDir === "多头") {
              trendAdvice = "趋势维持良好，沿5日线/20日线持股，享受趋势红利。";
          } else {
              trendAdvice = "目前处于中位震荡区间，缺乏方向感，建议关注箱体突破方向。";
          }
      }

      if (trendStrength < 20) trendStrengthLevel = 'very-weak';
      else if (trendStrength < 40) trendStrengthLevel = 'weak';
      else if (trendStrength < 60) trendStrengthLevel = 'moderate';
      else if (trendStrength < 80) trendStrengthLevel = 'strong';
      else t0StrengthLevel = 'very-strong';

      let holdingInfo = null;
      if (myPos) {
          const marketVal = s.price * myPos.shares;
          const costVal = myPos.cost * myPos.shares;
          const pnl = marketVal - costVal;
          const pnlPercent = costVal > 0 ? (pnl / costVal) * 100 : 0;
          
          let hAdvice = "";
          if (pnlPercent > 5) hAdvice = "持仓盈利良好，可设置止盈保护线。";
          else if (pnlPercent < -5) {
              if (trendPos === "低位") hAdvice = "深套勿慌，股价已至低位，可尝试日内T+0降低成本。";
              else hAdvice = "亏损扩大，注意控制仓位，反抽均线可考虑减仓。";
          } else hAdvice = "成本附近震荡，耐心持有。";

          holdingInfo = { pnl, pnlPercent, advice: hAdvice };
      }

      return {
          t0: { 
            action: t0Action, 
            buyPoint: t0Buy, 
            sellPoint: t0Sell, 
            desc: t0Desc, 
            strength: rawStrength,
            strengthLevel: t0StrengthLevel,
            confidence: confidence,
            executionScore: liquidityScore
          },
          trend: { 
            position: trendPos, 
            trend: trendDir, 
            advice: trendAdvice, 
            rsi,
            strength: trendStrength,
            strengthLevel: trendStrengthLevel
          },
          holding: holdingInfo
      };

    } catch (e) { return null; }
  }, [selStock, portfolio]);

  const fmt = (n: number) => n > 100000000 ? (n/100000000).toFixed(2)+'亿' : (n/10000).toFixed(2)+'万';

  // 🕹️ 核心逻辑：提交委托 (挂单)
  const handleTradeAction = (type: 'BUY' | 'SELL', e?: React.MouseEvent) => {
      if (e) { e.preventDefault(); e.stopPropagation(); } 
      
      if (!selectedCode) return;
      const price = parseFloat(simPrice);
      const vol = parseInt(simVol);
      
      if (isNaN(price) || price <= 0 || isNaN(vol) || vol <= 0) {
          alert('请输入有效的价格和数量');
          return;
      }
      
      // 🛡️ 高价买入预警
      if (type === 'BUY' && selStock && price > selStock.price) {
          if (!confirm(`⚠️ 警告：您的买入价 ${price} 高于当前价 ${selStock.price}，将可能以较高成本成交。\n\n是否继续？`)) {
              return;
          }
      }
      
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      
      setSimState(prev => {
          const account = prev.positions[selectedCode] || { holding: 0, avgCost: 0, realizedPnl: 0, trades: [], pending: [] };
          const currentPending = Array.isArray(account.pending) ? account.pending : [];
          
          let newCash = prev.cash;
          let newHolding = account.holding; 
          
          const newOrder: PendingOrder = {
              id: Date.now().toString(),
              time: timeStr,
              price: price,
              shares: vol,
              type: type
          };

          // 预扣除逻辑 (冻结)
          if (type === 'BUY') {
              const needed = price * vol;
              if (newCash < needed) {
                  alert(`资金不足！需要 ${needed.toFixed(2)}，可用 ${newCash.toFixed(2)}`);
                  return prev;
              }
              newCash -= needed;
          } else {
              if (newHolding < vol) {
                  alert(`持仓不足！当前 ${newHolding}，尝试卖出 ${vol}`);
                  return prev;
              }
              newHolding -= vol; 
          }

          return {
              ...prev,
              cash: newCash,
              positions: {
                  ...prev.positions,
                  [selectedCode]: {
                      ...account,
                      holding: newHolding, 
                      pending: [...currentPending, newOrder]
                  }
              }
          };
      });
  };

  // 🤖 撮合引擎：实时监控股价，触发成交
  useEffect(() => {
      if (!selStock) return;
      
      try {
        setSimState(prev => {
            const account = prev.positions[selStock.code];
            if (!account || !Array.isArray(account.pending) || account.pending.length === 0) return prev;

            let hasChanges = false;
            let newPending = [...account.pending];
            let newTrades = Array.isArray(account.trades) ? [...account.trades] : [];
            let newCash = prev.cash; 
            let newHolding = account.holding;
            let newAvgCost = account.avgCost; 
            let newRealizedPnl = account.realizedPnl || 0; 

            const currentPrice = selStock.price;
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

            // 遍历检查所有委托单
            const remainingOrders = newPending.filter(order => {
                let executed = false;
                
                // 买入规则
                if (order.type === 'BUY' && currentPrice <= order.price) {
                    executed = true;
                    const costBasis = (newHolding * newAvgCost) + (order.price * order.shares);
                    newHolding += order.shares;
                    newAvgCost = newHolding > 0 ? costBasis / newHolding : 0;
                } 
                // 卖出规则
                else if (order.type === 'SELL' && currentPrice >= order.price) {
                    executed = true;
                    newCash += order.price * order.shares;
                    const tradePnl = (order.price - newAvgCost) * order.shares;
                    newRealizedPnl += tradePnl;
                }

                if (executed) {
                    hasChanges = true;
                    newTrades.push({
                        id: order.id + '_exec',
                        time: timeStr,
                        price: order.price, 
                        shares: order.shares,
                        type: order.type,
                        amount: order.price * order.shares
                    });
                    return false; 
                }
                return true; 
            });

            if (!hasChanges) return prev;

            return {
                ...prev,
                cash: newCash,
                positions: {
                    ...prev.positions,
                    [selStock.code]: {
                        ...account,
                        holding: newHolding,
                        avgCost: newAvgCost,
                        realizedPnl: newRealizedPnl, 
                        trades: newTrades,
                        pending: remainingOrders
                    }
                }
            };
        });
      } catch(e) { console.error("Matching Engine Error", e); }
  }, [selStock]); 

  const cancelOrder = (orderId: string) => {
      if (!selectedCode) return;
      setSimState(prev => {
          const account = prev.positions[selectedCode];
          if (!account) return prev;
          
          const pendingList = Array.isArray(account.pending) ? account.pending : [];
          const orderToCancel = pendingList.find(o => o.id === orderId);
          if (!orderToCancel) return prev;

          let newCash = prev.cash;
          let newHolding = account.holding;

          if (orderToCancel.type === 'BUY') {
              newCash += orderToCancel.price * orderToCancel.shares;
          } else {
              newHolding += orderToCancel.shares;
          }

          return {
              ...prev,
              cash: newCash,
              positions: {
                  ...prev.positions,
                  [selectedCode]: {
                      ...account,
                      holding: newHolding,
                      pending: pendingList.filter(o => o.id !== orderId)
                  }
              }
          };
      });
  };

  const updateCapital = () => {
      const newCap = parseFloat(tempCapital);
      if (!isNaN(newCap) && newCap > 0) {
          setSimState(prev => ({
              ...prev,
              initialCapital: newCap,
              cash: newCap 
          }));
          setIsSettingCapital(false);
      }
  };

  const deleteTrade = (tradeId: string) => {
      setSimState(prev => {
          const currentPos = prev.positions[selectedCode];
          if (!currentPos || !Array.isArray(currentPos.trades)) return prev;
          
          return {
              ...prev,
              positions: {
                  ...prev.positions,
                  [selectedCode]: {
                      ...currentPos,
                      trades: currentPos.trades.filter(t => t.id !== tradeId)
                  }
              }
          };
      });
  };

  const resetAccount = () => {
      if (confirm('确定要【销户重开】吗？\n此操作将清空所有股票持仓和交易记录，资金恢复初始值。')) {
          setSimState({ cash: 1000000, initialCapital: 1000000, positions: {} });
      }
  };

  const clearStock = () => {
      if (!selectedCode) return;
      if (confirm(`确定要清空【${selStock?.name}】的所有记录吗？\n\n注意：这相当于“回滚”操作，该股占用的资金将按【成本价】退回账户。`)) {
          setSimState(prev => {
              const currentPos = prev.positions[selectedCode];
              if (!currentPos) return prev;
              
              let refund = currentPos.holding * currentPos.avgCost;
              if (currentPos.pending) {
                  currentPos.pending.forEach(o => {
                      if (o.type === 'BUY') refund += o.price * o.shares;
                  });
              }

              const nextPositions = { ...prev.positions };
              delete nextPositions[selectedCode];
              
              return {
                  ...prev,
                  cash: prev.cash + refund,
                  positions: nextPositions
              };
          });
      }
  };

  const currentSimPos = simState.positions[selectedCode];
  const simPnl = useMemo(() => {
      if (!selStock || !currentSimPos || currentSimPos.holding === 0) return null;
      const marketVal = selStock.price * currentSimPos.holding;
      const costVal = currentSimPos.avgCost * currentSimPos.holding;
      const val = marketVal - costVal;
      const pct = costVal > 0 ? (val / costVal) * 100 : 0;
      return { val, pct };
  }, [selStock, currentSimPos]);
  
  // 全局总资产计算
  const totalAssets = useMemo(() => {
      let totalMarketValue = 0;
      Object.keys(simState.positions).forEach(code => {
          const pos = simState.positions[code];
          const stock = stocks.find(s => s.code === code);
          const currentPrice = stock ? stock.price : pos.avgCost; 
          totalMarketValue += pos.holding * currentPrice;
      });
      return simState.cash + totalMarketValue;
  }, [simState, stocks]);
  
  const totalPnl = totalAssets - simState.initialCapital;

  return (
    <div className="fixed inset-0 supports-[height:100dvh]:h-[100dvh] bg-[#0f1115] text-gray-300 font-sans flex flex-col overflow-hidden select-none">
      <header className="h-12 border-b border-gray-800 bg-[#161920] flex items-center justify-between px-4 z-10 shrink-0">
         <div className="flex items-center gap-2 text-emerald-400 font-bold tracking-widest">
            <Activity size={18}/> WUKONG PRO <span className="bg-blue-600 text-white text-[9px] px-1.5 rounded">V12.0</span>
         </div>
         
         <div className="flex gap-3 items-center">
            <div onClick={()=> { setTempCapital(simState.initialCapital.toString()); setIsSettingCapital(true); }} className="flex flex-col items-end cursor-pointer group">
                <div className="text-[10px] text-gray-400 flex items-center gap-1">
                    <CircleDollarSign size={10} className="text-yellow-500"/> 模拟总资产
                </div>
                <div className={`text-xs font-mono font-bold flex items-center gap-1 ${totalPnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {totalAssets.toFixed(0)} <span className="text-[8px] bg-gray-800 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">设置</span>
                </div>
            </div>

            <button onClick={() => setIsSyncModalOpen(true)} className="text-gray-400 hover:text-white flex items-center gap-1 ml-2">
                <User size={16}/>
            </button>
         </div>
      </header>

      {/* 修改本金弹窗 */}
      {isSettingCapital && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={()=>setIsSettingCapital(false)}>
              <div className="bg-[#1c1f26] border border-gray-700 rounded-lg p-6 w-full max-w-sm" onClick={e=>e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-white font-bold flex items-center gap-2"><Settings size={18}/> 设置模拟本金</h3>
                      <button onClick={()=>setIsSettingCapital(false)} className="text-gray-500">✕</button>
                  </div>
                  <div className="space-y-4">
                      <div className="text-xs text-gray-400">设置初始资金将重置可用余额。</div>
                      <input type="number" value={tempCapital} onChange={e=>setTempCapital(e.target.value)} className="w-full bg-black border border-gray-600 rounded px-3 py-2 text-white font-mono" />
                      <button onClick={updateCapital} className="w-full bg-blue-600 text-white py-2 rounded font-bold">确认修改</button>
                  </div>
              </div>
          </div>
      )}

      {/* 云同步弹窗 */}
      {isSyncModalOpen && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={()=>setIsSyncModalOpen(false)}>
              <div className="bg-[#1c1f26] border border-gray-700 rounded-lg p-6 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-white font-bold flex items-center gap-2"><LinkIcon size={18}/> 数据云同步</h3>
                      <button onClick={()=>setIsSyncModalOpen(false)} className="text-gray-500">✕</button>
                  </div>
                  {!syncLink ? (
                      <div className="space-y-4">
                          <button onClick={generateSyncLink} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded flex items-center justify-center gap-2 font-bold">
                              <Upload size={16}/> 生成同步链接
                          </button>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          <div className="bg-black/50 p-3 rounded text-[10px] text-gray-500 break-all font-mono border border-gray-700">
                              {syncLink}
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative pb-[calc(50px+env(safe-area-inset-bottom))] md:pb-0">
         
         {/* 左侧列表 */}
         <div className={`md:w-72 bg-[#12141a] border-r border-gray-800 flex flex-col ${mobileTab === 'LIST' ? 'w-full flex-1' : 'hidden md:flex'}`}>
            <div className="p-3 border-b border-gray-800 flex gap-2 shrink-0 items-center">
               <div className="relative flex-1">
                 <Search size={12} className="absolute left-2 top-2 text-gray-500"/>
                 <input value={inputCode} onChange={e=>setInputCode(e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded pl-7 py-1 text-xs text-white focus:border-blue-500 outline-none" placeholder="代码 (hk00700, sh600519)" disabled={isSorting}/>
               </div>
               {!isSorting && <button onClick={(e)=>{e.preventDefault();if(inputCode && !codes.includes(inputCode)){setCodes([inputCode,...codes]);setInputCode('')}}} className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600 h-full"><Plus size={14}/></button>}
               {!isSorting && (
                   <button onClick={() => setIsGenieMode(!isGenieMode)} className={`px-2 py-1 rounded h-full transition-all flex items-center justify-center ${isGenieMode ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(147,51,234,0.5)]' : 'bg-gray-800 text-gray-400'}`} title="短线精灵">
                     <Wand2 size={14}/>
                   </button>
               )}
               <button onClick={() => setIsSorting(!isSorting)} className={`px-2 py-1 rounded h-full transition-colors ${isSorting ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}><ArrowUpDown size={14}/></button>
            </div>
            
            {isGenieMode && (
                <div className="px-3 py-1 bg-purple-900/20 border-b border-purple-900/30 flex items-center gap-2 text-[10px] text-purple-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"/>
                    正在扫描异动...
                </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin">
               {codes.map((c, index) => {
                 const s = stocks.find(item => item.code === c);
                 const genieSignal = s ? GenieEngine.analyze(s) : null;
                 if (isGenieMode && !genieSignal) return null;

                 return (
                   <div key={c} draggable={!isSorting} 
                        onDragStart={(e)=>handleDragStart(e,c)} 
                        onDragOver={(e)=>{e.preventDefault();if(draggedCode!==c)setDragOverCode(c)}} 
                        onDrop={(e)=>handleDrop(e,c)} 
                        onClick={()=>{ if(!isSorting) { setSelectedCode(c); if(window.innerWidth < 768) setMobileTab('CHART'); } }}
                        className={`relative p-3 border-b border-gray-800/50 cursor-pointer hover:bg-[#1c1f26] group ${selectedCode===c && !isSorting ? 'bg-[#1c1f26] border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'} ${draggedCode===c?'opacity-30':''} ${isSorting ? 'pr-2' : 'pr-9'}`}>
                     {dragOverCode===c && draggedCode!==c && !isSorting && <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-500 z-20"/>}
                     <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1 overflow-hidden">
                           <span className="font-bold text-gray-200 text-xs truncate max-w-[4.5rem]">{s ? s.name : c}</span>
                           {genieSignal && <span className={`text-[9px] px-1 rounded border shrink-0 ${genieSignal.color}`}>{genieSignal.label}</span>}
                        </div>
                        {s && <span className={`text-xs font-bold ${s.changePercent>=0?'text-red-400':'text-green-400'}`}>{s.changePercent}%</span>}
                     </div>
                     <div className="flex justify-between text-[10px] text-gray-500">
                         <span>{c}</span>
                         {s && !isSorting && (
                             <div className="flex flex-col items-end">
                                 <span className="font-mono text-gray-300">{s.price.toFixed(2)}</span>
                                 <div className="text-[8px] text-gray-600">
                                     PE: {s.pe.toFixed(1)} | 换手: {s.turnover}%
                                 </div>
                             </div>
                         )}
                     </div>
                     {!isSorting && (<button onClick={(e)=>{e.stopPropagation();setCodes(codes.filter(x=>x!==c))}} className="absolute right-0 top-0 bottom-0 w-8 flex items-center justify-center text-gray-600 md:opacity-0 md:group-hover:opacity-100 transition-all z-10 border-l border-gray-800 bg-[#1c1f26]/80"><Trash2 size={13}/></button>)}
                     {isSorting && (<div className="absolute right-1 top-0 bottom-0 flex items-center gap-1"><button onClick={(e) => { e.stopPropagation(); moveStock(index, 'UP'); }} disabled={index === 0} className={`p-1 rounded ${index === 0 ? 'text-gray-700' : 'text-blue-400 bg-blue-900/20'}`}><ArrowUp size={14}/></button><button onClick={(e) => { e.stopPropagation(); moveStock(index, 'DOWN'); }} disabled={index === codes.length - 1} className={`p-1 rounded ${index === codes.length - 1 ? 'text-gray-700' : 'text-blue-400 bg-blue-900/20'}`}><ArrowDown size={14}/></button></div>)}
                   </div>
                 )
               })}
            </div>
         </div>

         {/* 中间图表区域 */}
         <div className={`bg-[#0f1115] flex flex-col min-w-0 ${mobileTab === 'CHART' ? 'w-full flex-1' : 'hidden md:flex md:flex-1'}`}>
            {selStock ? (
              <>
                <div className="h-16 md:h-20 border-b border-gray-800 bg-[#161920] px-4 md:px-6 flex items-center justify-between shrink-0">
                   <div>
                      <h1 className="text-lg md:text-xl font-bold text-white flex items-end gap-3">{selStock.name} <span className="text-xs md:text-sm text-gray-500 font-mono font-normal mb-0.5">{selStock.code}</span></h1>
                      <div className="flex gap-4 mt-1 text-[10px] text-gray-500"><span className="flex items-center gap-1"><Clock size={10}/> 交易中</span><span>{selStock.mktCap > 0 ? fmt(selStock.mktCap) : ''}</span></div>
                   </div>
                   <div className="text-right">
                      <div className={`text-3xl md:text-4xl font-mono font-bold tracking-tighter ${selStock.changePercent>=0?'text-red-500':'text-green-500'}`}>{selStock.price.toFixed(2)}</div>
                      <div className={`text-xs md:text-sm font-bold ${selStock.changePercent>=0?'text-red-500':'text-green-500'}`}>{selStock.changePercent>0?'+':''}{selStock.changePercent}%</div>
                   </div>
                </div>

                <div className="p-2 md:p-4 grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 border-b border-gray-800 shrink-0 bg-[#0f1115]">
                   <QuoteItem label="最高" val={selStock.high.toFixed(2)} color="text-red-400"/>
                   <QuoteItem label="最低" val={selStock.low.toFixed(2)} color="text-green-400"/>
                   <QuoteItem label="今开" val={selStock.open.toFixed(2)} />
                   <QuoteItem label="昨收" val={selStock.prevClose.toFixed(2)} />
                   <QuoteItem label="成交量" val={fmt(selStock.volume)} color="text-yellow-400"/>
                   <QuoteItem label="换手" val={selStock.turnover+'%'} />
                </div>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                   <div className="flex-[1.5] md:flex-1 md:min-h-[180px] relative border-b border-gray-800">
                      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 text-[10px] text-gray-500 pointer-events-none"><TrendingUp size={10}/> 分时走势</div>
                      {/* V12.0: 纯净图表 */}
                      <IntradayChart data={selStock.minuteData} prevClose={selStock.prevClose} code={selStock.code} t0Buy={report?.t0.buyPoint} t0Sell={report?.t0.sellPoint} />
                   </div>
                   <div className="flex-1 md:min-h-[150px] relative bg-[#0b0c10]">
                      <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-[10px] text-gray-500 pointer-events-none"><BarChart2 size={10}/> 日K线</div>
                      <CandleChart data={selStock.klineData} subChartMode={subChartMode} setSubChartMode={setSubChartMode} />
                   </div>
                </div>
                
                <div className="h-8 bg-[#1a1d24] border-t border-gray-800 flex items-center px-4 text-[10px] text-gray-500">
                  {selStock.code.startsWith('us') && <span className="text-blue-400">⚠️ 美股盘前数据可能失真</span>}
                  {selStock.turnover < 0.1 && <span className="text-yellow-400">⚠️ 成交量过低，信号可靠性下降</span>}
                  {!selStock.code.startsWith('us') && selStock.turnover >= 0.1 && <span className="text-gray-500">💡 本系统提供辅助参考，不构成投资建议</span>}
                </div>
              </>
            ) : <div className="flex-1 flex items-center justify-center text-gray-600 gap-2"><MousePointer2/> 请选择股票</div>}
         </div>

         {/* 右侧策略栏 */}
         <div className={`bg-[#12141a] border-l border-gray-800 flex flex-col shrink-0 ${mobileTab === 'AI' ? 'w-full flex-1' : 'hidden md:flex md:w-72'}`}>
            <div className="p-4 border-b border-gray-800 bg-gradient-to-b from-[#1a1d24] to-transparent">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-400 flex gap-1 items-center"><Wallet size={12}/> 我的持仓</span>
                    <button onClick={()=>setIsEditingPortfolio(!isEditingPortfolio)} className="text-gray-500 hover:text-blue-400"><Edit2 size={12}/></button>
                </div>
                {isEditingPortfolio ? (
                    <div className="space-y-2 bg-black/30 p-2 rounded border border-gray-700">
                        <div className="flex gap-2 items-center text-[10px]">
                            <span className="w-8 text-gray-500">均价</span>
                            <input value={tempCost} onChange={e=>setTempCost(e.target.value)} className="flex-1 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white" placeholder="0.00"/>
                        </div>
                        <div className="flex gap-2 items-center text-[10px]">
                            <span className="w-8 text-gray-500">股数</span>
                            <input value={tempShares} onChange={e=>setTempShares(e.target.value)} className="flex-1 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white" placeholder="0"/>
                        </div>
                        <button onClick={savePortfolio} className="w-full bg-blue-600 text-white text-[10px] py-1 rounded flex items-center justify-center gap-1"><Save size={10}/> 保存持仓</button>
                    </div>
                ) : (
                    report?.holding ? (
                        <div>
                            <div className="flex justify-between items-end mb-1">
                                <span className={`text-2xl font-bold ${report.holding.pnl>=0?'text-red-500':'text-green-500'}`}>{report.holding.pnl>0?'+':''}{report.holding.pnl.toFixed(2)}</span>
                                <span className={`text-xs font-bold ${report.holding.pnl>=0?'text-red-400':'text-green-400'}`}>{report.holding.pnlPercent.toFixed(2)}%</span>
                            </div>
                            <div className="w-full h-2 bg-gray-700 rounded-full mb-1 overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-red-500 via-gray-500 to-green-500" 
                                    style={{
                                        width: '100%',
                                        position: 'relative'
                                    }}
                                >
                                    <div 
                                        className="absolute top-0 w-0.5 h-2 bg-white z-10" 
                                        style={{ left: `${Math.min(100, Math.max(0, (selStock.price - report.holding.pnlPercent / 100) / (selStock.price * 2) * 100))}%` }}
                                    ></div>
                                </div>
                            </div>
                            <div className="text-[10px] text-gray-500 bg-gray-800/30 p-1.5 rounded">{report.holding.advice}</div>
                        </div>
                    ) : <div className="text-xs text-gray-600 py-2 text-center">点击右上角编辑持仓</div>
                )}
            </div>

            <div className="flex border-b border-gray-800">
                <button onClick={()=>setStrategyTab('T0')} className={`flex-1 py-2 text-xs font-bold border-b-2 ${strategyTab==='T0'?'text-blue-400 border-blue-500 bg-blue-900/10':'text-gray-500 border-transparent hover:text-gray-300'}`}>日内 T+0</button>
                <button onClick={()=>setStrategyTab('SIM')} className={`flex-1 py-2 text-xs font-bold border-b-2 ${strategyTab==='SIM'?'text-orange-400 border-orange-500 bg-orange-900/10':'text-gray-500 border-transparent hover:text-gray-300'}`}>模拟复盘</button>
                <button onClick={()=>setStrategyTab('TREND')} className={`flex-1 py-2 text-xs font-bold border-b-2 ${strategyTab==='TREND'?'text-purple-400 border-purple-500 bg-purple-900/10':'text-gray-500 border-transparent hover:text-gray-300'}`}>趋势波段</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {report && strategyTab === 'T0' && (
                    <>
                        <div className={`border p-3 rounded-lg shadow-lg ${
                            report.t0.action === '机会' ? 'bg-green-900/10 border-green-900/30' : 
                            report.t0.action === '风险' ? 'bg-red-900/10 border-red-900/30' : 
                            'bg-gray-800/10 border-gray-700'
                        }`}>
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] text-blue-400 font-bold flex items-center gap-1"><Target size={12}/> T0 信号</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                    report.t0.action==='机会'?'bg-green-900/30 text-green-400':
                                    report.t0.action==='风险'?'bg-red-900/30 text-red-400':'bg-gray-800 text-gray-400'
                                }`}>{report.t0.action}</span>
                            </div>
                            <div className="flex justify-between items-center text-center">
                                <div className="flex-1">
                                    <div className="text-[9px] text-gray-500 mb-0.5">挂单买入</div>
                                    <div className="text-sm font-mono text-red-400 font-bold">{report.t0.buyPoint ? report.t0.buyPoint.toFixed(2) : '--'}</div>
                                </div>
                                <div className="w-[1px] h-6 bg-gray-700 mx-2"></div>
                                <div className="flex-1">
                                    <div className="text-[9px] text-gray-500 mb-0.5">挂单卖出</div>
                                    <div className="text-sm font-mono text-green-400 font-bold">{report.t0.sellPoint ? report.t0.sellPoint.toFixed(2) : '--'}</div>
                                </div>
                            </div>
                            <SignalStrengthVisual stock={selStock} report={report} />
                        </div>
                        <div className="p-3 rounded border border-blue-900/30 bg-blue-900/10">
                            <div className="text-[10px] text-blue-400 mb-1 font-bold">策略逻辑</div>
                            <p className="text-xs text-gray-400 leading-relaxed">{report.t0.desc}</p>
                        </div>
                    </>
                )}

                {/* 🛡️ [SIM] V12: 全真模拟交易面板 */}
                {strategyTab === 'SIM' && selStock && stockPerformance && (
                    <div className="space-y-4">
                        {/* 1. 个股持仓与盈亏概览 */}
                        <div className="bg-gray-800/30 border border-gray-700 p-3 rounded-lg">
                            <div className="flex justify-between items-center mb-3">
                                <div className="text-xs font-bold text-orange-400 flex items-center gap-1"><Calculator size={14}/> 模拟持仓</div>
                                {/* V12 新增：累计总盈亏展示 */}
                                <div className={`text-xs font-mono font-bold ${stockPerformance.total >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    总计: {stockPerformance.total > 0 ? '+' : ''}{stockPerformance.total.toFixed(0)}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-center mb-2">
                                <div>
                                    <div className="text-[9px] text-gray-500">持仓 / 成本</div>
                                    <div className="text-sm font-mono font-bold text-white">
                                        {stockPerformance.holding} <span className="text-gray-500 text-[10px]">/ {stockPerformance.avgCost.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-gray-500">浮动盈亏</div>
                                    <div className={`text-sm font-mono font-bold ${stockPerformance.floating >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        {stockPerformance.floating > 0 ? '+' : ''}{stockPerformance.floating.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                            
                            {/* 已结盈亏条 */}
                            <div className="flex justify-between items-center text-[9px] bg-black/20 p-1.5 rounded border border-gray-800/50">
                                <span className="text-gray-500">已结盈亏(历史)</span>
                                <span className={`font-mono font-bold ${stockPerformance.realized >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                                    {stockPerformance.realized > 0 ? '+' : ''}{stockPerformance.realized.toFixed(2)}
                                </span>
                            </div>

                            <div className="mt-2 flex justify-between gap-2">
                                <button onClick={clearStock} className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 text-[10px] rounded flex items-center justify-center gap-1 text-gray-300">
                                    <Trash2 size={10}/> 清空该股
                                </button>
                                <button onClick={resetAccount} className="flex-1 py-1 bg-red-900/50 hover:bg-red-900 text-[10px] rounded flex items-center justify-center gap-1 text-red-200 border border-red-900">
                                    <RotateCcw size={10}/> 销户重开
                                </button>
                            </div>
                        </div>

                        {/* 2. 下单操作区 */}
                        <div className="bg-gray-800/30 border border-gray-700 p-3 rounded-lg space-y-2">
                             <div className="flex gap-2 items-center">
                                 <div className="flex-1 bg-black border border-gray-600 rounded px-2 py-1 flex items-center gap-2">
                                     <span className="text-[10px] text-gray-500 shrink-0">价格</span>
                                     <input type="number" value={simPrice} onChange={e=>setSimPrice(e.target.value)} className="w-full bg-transparent text-white text-xs font-mono outline-none" />
                                 </div>
                                 <div className="w-24 bg-black border border-gray-600 rounded px-2 py-1 flex items-center gap-1">
                                     <input type="number" value={simVol} onChange={e=>setSimVol(e.target.value)} step="100" className="w-full bg-transparent text-white text-xs font-mono outline-none text-center" />
                                     <span className="text-[8px] text-gray-500">股</span>
                                 </div>
                             </div>
                             <div className="flex gap-2">
                                 <button onClick={(e)=>handleTradeAction('BUY', e)} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded font-bold text-xs flex items-center justify-center gap-1"><Plus size={12}/> 买入</button>
                                 <button onClick={(e)=>handleTradeAction('SELL', e)} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded font-bold text-xs flex items-center justify-center gap-1"><Minus size={12}/> 卖出</button>
                             </div>
                             <div className="text-[9px] text-center text-gray-500 flex justify-between">
                                 <span>可用资金: {simState.cash.toFixed(0)}</span>
                                 <span>最大可买: {selStock.price > 0 ? Math.floor(simState.cash / selStock.price) : 0}股</span>
                             </div>
                        </div>

                        {/* 3. 待成交委托 (支持撤单) - 防御渲染 */}
                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-500 font-bold flex items-center justify-between">
                                <span>当前委托</span>
                                <span className="text-[8px] opacity-50">价格触发时自动成交</span>
                            </div>
                            <div className="max-h-[100px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                                {(currentSimPos?.pending || []).length > 0 ? (
                                    (currentSimPos?.pending || []).map((order) => (
                                    <div key={order.id} className="flex justify-between items-center text-[10px] p-2 bg-gray-800/40 rounded border border-gray-700/50">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold ${order.type==='BUY'?'text-red-400':'text-green-400'}`}>{order.type==='BUY'?'买入':'卖出'}</span>
                                            <span className="text-white font-mono">{order.price.toFixed(2)}</span>
                                            <span className="text-gray-500">x{order.shares}</span>
                                        </div>
                                        <button onClick={()=>cancelOrder(order.id)} className="text-gray-500 hover:text-red-400 flex items-center gap-1 px-2 py-0.5 rounded border border-gray-700 bg-gray-900">
                                            <XCircle size={10}/> 撤单
                                        </button>
                                    </div>
                                    ))
                                ) : (
                                    <div className="text-center text-[10px] text-gray-600 py-2 border border-dashed border-gray-800 rounded">暂无挂单</div>
                                )}
                            </div>
                        </div>

                        {/* 4. 成交记录 (支持删除) - 防御渲染 */}
                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-500 font-bold">成交记录</div>
                            <div className="max-h-[150px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                                {(currentSimPos?.trades || []).length > 0 ? (
                                    (currentSimPos?.trades || []).slice().reverse().map((t, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-[10px] p-2 bg-gray-800/20 rounded border border-gray-800 group">
                                        <div className="flex gap-2 items-center">
                                            <span className="text-gray-400 font-mono w-8">{t.time}</span>
                                            <span className={`font-bold w-6 text-center ${t.type==='BUY'?'text-red-400':'text-green-400'}`}>{t.type === 'BUY' ? '买' : '卖'}</span>
                                            <span className="text-gray-300 font-mono w-12 text-right">{t.price.toFixed(2)}</span>
                                            <span className="text-gray-500 font-mono text-right">x{t.shares}</span>
                                        </div>
                                        <button onClick={()=>deleteTrade(t.id)} className="text-gray-600 hover:text-red-500 opacity-50 group-hover:opacity-100 transition-all p-1">
                                            <Trash2 size={10}/>
                                        </button>
                                    </div>
                                    ))
                                ) : (
                                    <div className="text-center text-[10px] text-gray-600 py-2">暂无成交</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {report && strategyTab === 'TREND' && (
                    <>
                        <div className="flex gap-2">
                            <div className="flex-1 bg-gray-800/30 border border-gray-700 p-2 rounded text-center">
                                <div className="text-[9px] text-gray-500">相对位置</div>
                                <div className={`text-xs font-bold mt-1 ${report.trend.position==='低位'?'text-green-400':report.trend.position==='高位'?'text-red-400':'text-yellow-400'}`}>{report.trend.position}</div>
                            </div>
                            <div className="flex-1 bg-gray-800/30 border border-gray-700 p-2 rounded text-center">
                                <div className="text-[9px] text-gray-500">均线趋势</div>
                                <div className={`text-xs font-bold mt-1 ${report.trend.trend==='多头'?'text-red-400':'text-green-400'}`}>{report.trend.trend}</div>
                            </div>
                            <div className="flex-1 bg-gray-800/30 border border-gray-700 p-2 rounded text-center">
                                <div className="text-[9px] text-gray-500">RSI</div>
                                <div className="text-xs font-bold mt-1 text-purple-400">{report.trend.rsi.toFixed(1)}</div>
                            </div>
                        </div>
                        
                        <div className="border p-3 rounded-lg shadow-lg bg-gray-800/10 border-gray-700">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] text-purple-400 font-bold flex items-center gap-1"><BarChart2 size={12}/> 趋势强度</span>
                                <span className="text-[10px] text-gray-500">{report.trend.strengthLevel}</span>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between text-[9px]">
                                  <span className="text-gray-400">趋势强度</span>
                                  <span className={
                                    report.trend.strength < 20 ? 'text-gray-400' : 
                                    report.trend.strength < 40 ? 'text-green-400' : 
                                    report.trend.strength < 60 ? 'text-yellow-400' : 
                                    report.trend.strength < 80 ? 'text-orange-400' : 
                                    'text-red-400'
                                  }>{report.trend.strength.toFixed(0)}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                                  <div 
                                    className={
                                      report.trend.strength < 20 ? 'h-full bg-gray-500' : 
                                      report.trend.strength < 40 ? 'h-full bg-green-500' : 
                                      report.trend.strength < 60 ? 'h-full bg-yellow-500' : 
                                      report.trend.strength < 80 ? 'h-full bg-orange-500' : 
                                      'h-full bg-red-500'
                                    } 
                                    style={{ width: `${report.trend.strength}%` }}
                                  ></div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-3 rounded border border-purple-900/30 bg-purple-900/10">
                            <div className="text-[10px] text-purple-400 mb-1 font-bold">波段建议</div>
                            <p className="text-xs text-gray-400 leading-relaxed">{report.trend.advice}</p>
                        </div>
                    </>
                )}
            </div>
         </div>

         <div className="fixed bottom-0 left-0 w-full h-[50px] pb-[env(safe-area-inset-bottom)] box-content bg-[#161920] border-t border-gray-800 flex items-center justify-around z-50 md:hidden text-[10px] text-gray-500">
            <button onClick={()=>setMobileTab('LIST')} className={`flex flex-col items-center gap-1 ${mobileTab==='LIST'?'text-white':''}`}><List size={20} /> 自选</button>
            <button onClick={()=>setMobileTab('CHART')} className={`flex flex-col items-center gap-1 ${mobileTab==='CHART'?'text-white':''}`}><LineChart size={20} /> 行情</button>
            <button onClick={()=>setMobileTab('AI')} className={`flex flex-col items-center gap-1 ${mobileTab==='AI'?'text-white':''}`}><Brain size={20} /> 策略</button>
         </div>

      </div>
    </div>
  );
}
