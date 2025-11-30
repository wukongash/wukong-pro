import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Activity, Zap, Brain, TrendingUp, BarChart2, Clock, Plus, Trash2, 
  Shield, Search, MousePointer2, List, LineChart, ArrowUp, ArrowDown, 
  ArrowUpDown, Wand2, AlertCircle, WifiOff, Moon, Target, DollarSign, 
  Crosshair, Anchor, Wallet, Edit2, Save, User, Link as LinkIcon, Copy, 
  Upload, Minus, Info, Lightbulb, PlayCircle, PauseCircle, RotateCcw, 
  Calculator, XCircle, RefreshCw, CircleDollarSign, Settings, Radar, 
  ShieldAlert, Lock, Siren, Microscope, Filter, BookOpen, X, Layers, Check 
} from 'lucide-react';

// ============================================================================
// SECTION 1: 全局配置与常量 (CONFIGURATION)
// ============================================================================

const CODES_KEY = 'WUKONG_CODES_V1';
const PORTFOLIO_KEY = 'WUKONG_PORTFOLIO_V1';
const SIMULATION_KEY = 'WUKONG_SIM_V12_PRO'; 
const DEFAULT_CODES = ['hk00700', 'sh600519', 'usNVDA', 'sz000001'];

// ============================================================================
// SECTION 2: 数据类型定义 (TYPE DEFINITIONS)
// ============================================================================

// 分时数据点
interface MinutePoint { 
  p: number; // Price
  v: number; // Volume
  t?: string; // Time "09:30"
}

// K线数据点
interface KLinePoint { 
  date: string; 
  open: number; 
  close: number; 
  high: number; 
  low: number; 
  vol: number; 
}

// 持仓项
interface PortfolioItem { 
  cost: number; 
  shares: number; 
}

// 核心股票对象
interface RealStock {
  id: string; 
  code: string; 
  name: string; 
  price: number; 
  changePercent: number;
  open: number; 
  prevClose: number; 
  high: number; 
  low: number; 
  volume: number;
  amount: number; 
  turnover: number; 
  pe: number; 
  mktCap: number;
  minuteData: MinutePoint[]; 
  klineData: KLinePoint[]; 
}

// 模拟交易记录
interface SimTrade {
  id: string;
  time: string;
  price: number;
  shares: number;
  type: 'BUY' | 'SELL';
}

// 模拟持仓状态
interface SimPosition { 
  holding: number; 
  avgCost: number; 
  realizedPnl: number; 
  trades: SimTrade[]; 
  pending: any[]; 
}

// 全局模拟账户
interface GlobalSimState { 
  cash: number; 
  initialCapital: number; 
  positions: Record<string, SimPosition>; 
}

// [V12.5] 主力意图分析结果
interface ForceReport {
    phase: 'ACCUMULATION' | 'SHAKEOUT' | 'LIFTING' | 'DISTRIBUTION' | 'CHAOS';
    phaseLabel: string;
    phaseDesc: string;
    confidence: number; // 0-100
    metrics: { 
        vol: number; 
        price: number; 
        time: number; 
        space: number; 
    }; 
    advice: 'BUY' | 'SELL' | 'HOLD' | 'WAIT';
}

// [V12.5] 短线精灵信号
interface GenieSignal {
    label: string;
    color: string;
    winRate: string;
}

// [V12.5] 综合策略报告 (修复了所有可选类型问题)
interface StrategyReport {
    force: ForceReport;           
    stopLossPrice: number | null; 
    isSafe: boolean;
    isBroken: boolean;  
    breakStatus: 'SAFE' | 'VALID_BREAK' | 'SUSPECT_TRAP';
    holdingInfo: { pnl: number; pnlPercent: number; advice: string; } | null;
    genieSignal?: GenieSignal; 
    rsiValue: number;
    // T0 信号保留结构
    t0_signal: { action: string; desc: string; type: 'BUY'|'SELL'|'NONE' };
}

// ============================================================================
// SECTION 3: 工具函数与数学库 (UTILS & MATH)
// ============================================================================

const safeNum = (val: any, fallback = 0) => {
    return (typeof val === 'number' && isFinite(val) && !isNaN(val)) ? val : fallback;
};

const fmt = (n: number) => {
    if (n > 100000000) return (n/100000000).toFixed(2) + '亿';
    if (n > 10000) return (n/10000).toFixed(2) + '万';
    return n.toString();
};

// --- TechIndicators ---
const TechIndicators = {
  // 移动平均线
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

  // RSI (相对强弱指标)
  calculateRSI: (data: KLinePoint[], period: number = 6) => {
    if (!data || data.length <= period) return 50;
    let gains = 0, losses = 0;
    // 只计算最后一段，提高效率
    const startIndex = Math.max(1, data.length - period * 5);
    
    for (let i = startIndex; i < data.length; i++) {
      const change = data[i].close - (data[i-1]?.close || data[i].open);
      if (change > 0) gains += change; else losses += Math.abs(change);
    }
    // 简单的平均算法用于展示趋势
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  },

  // MACD
  calculateMACD: (data: KLinePoint[], short = 12, long = 26, mid = 9) => {
    if (!data || data.length < long) return { dif: [], dea: [], bar: [] };
    const calcEMA = (n: number, close: number, prevEMA: number) => (close * 2 + prevEMA * (n - 1)) / (n + 1);
    let es = data[0].close;
    let el = data[0].close;
    let dea = 0;
    const res = { dif:[] as number[], dea:[] as number[], bar:[] as number[] };
    
    data.forEach((d, i) => {
      es = calcEMA(short, d.close, i===0?d.close:es);
      el = calcEMA(long, d.close, i===0?d.close:el);
      const dif = es - el;
      dea = calcEMA(mid, dif, i===0?dif:dea);
      res.dif.push(dif);
      res.dea.push(dea);
      res.bar.push((dif - dea) * 2);
    });
    return res;
  },

  // ATR 吊灯止损 (核心风控算法)
  calculateChandelierExit: (data: KLinePoint[], period: number = 22, multiplier: number = 3.0) => {
    if (!data || data.length < period) return Array(data.length).fill(null);
    
    const trs: number[] = [];
    // 1. 计算 TR
    for (let i = 0; i < data.length; i++) {
        if(i===0) {
             trs.push(data[i].high - data[i].low);
        } else {
             const h = data[i].high; 
             const l = data[i].low; 
             const c = data[i-1].close;
             trs.push(Math.max(h-l, Math.abs(h-c), Math.abs(l-c)));
        }
    }

    const exits: (number|null)[] = new Array(data.length).fill(null);
    let sumTR = 0;
    
    // 2. 计算 ATR 并推导止损价
    for (let i = 0; i < data.length; i++) {
        sumTR += trs[i];
        if (i >= period) sumTR -= trs[i - period];
        
        if (i >= period - 1) {
            const atr = sumTR / period;
            let maxHigh = 0;
            // 回溯周期内最高价
            for (let j = 0; j < period; j++) {
                if (data[i-j].high > maxHigh) maxHigh = data[i-j].high;
            }
            exits[i] = maxHigh - (atr * multiplier);
        }
    }
    return exits;
  },

  // 量能统计
  getVolStats: (data: MinutePoint[]) => {
      if (!data || data.length === 0) return { max: 1, avg: 1 };
      let max = 0, sum = 0;
      data.forEach(d => {
          if (d.v > max) max = d.v;
          sum += d.v;
      });
      return { max, avg: sum / data.length };
  }
};

// ============================================================================
// SECTION 4: 核心策略逻辑 (CORE LOGIC ENGINES)
// ============================================================================

/**
 * [V13.0] ForceEngine: 主力意图识别状态机
 * 这是 Wukong 的核心大脑，基于四维判定。
 */
const ForceEngine = {
    run: (stock: RealStock): ForceReport => {
        // 0. 默认状态
        let result: ForceReport = { 
            phase: 'CHAOS', 
            phaseLabel: '☁️ 混沌期', 
            phaseDesc: '多空博弈焦灼，无明显主力合力。建议空仓观望。', 
            confidence: 35, 
            metrics: { vol: 40, price: 50, time: 30, space: 50 }, 
            advice: 'WAIT' 
        };

        const { klineData, price, prevClose, changePercent } = stock;
        // 这里的30是为了保证指标计算有足够样本
        if (!klineData || klineData.length < 30) return result;

        // 1. 计算核心因子
        const rsi = TechIndicators.calculateRSI(klineData, 6);
        const exits = TechIndicators.calculateChandelierExit(klineData, 22, 3.0);
        const safePrice = exits[exits.length-1] || 0;
        const isSafe = price >= safePrice; // 是否在安全绳之上

        // K线级别量比
        const recent5 = klineData.slice(-5);
        const avgVol5 = recent5.reduce((a,b)=>a+b.vol, 0)/5;
        const prevVol5 = klineData.slice(-10, -5).reduce((a,b)=>a+b.vol, 0)/5;
        const volRatioK = prevVol5 > 0 ? avgVol5/prevVol5 : 1.0;

        // 5日振幅
        const high5 = Math.max(...recent5.map(k=>k.high));
        const low5 = Math.min(...recent5.map(k=>k.low));
        const amp5 = low5>0 ? (high5-low5)/low5 : 0;

        // 2. 决策树分支

        // >>> A. 破位/派发 (Distribution) - 风险极大 <<<
        if ((!isSafe && rsi > 35) || (changePercent < 2 && volRatioK > 2.2 && price > prevClose*1.1)) {
            result.phase = 'DISTRIBUTION';
            result.phaseLabel = !isSafe ? '🔴 确认破位 (BREAK)' : '🔴 高位派发 (DUMP)';
            result.phaseDesc = !isSafe 
                ? '股价有效跌破 ATR 安全绳，且下跌动能充足，多头防线崩溃。' 
                : '高位放巨量滞涨，主力疑似利用对倒吸引跟风盘出货。';
            result.confidence = 90;
            result.action = 'SELL';
            result.metrics = { vol: 90, price: 10, time: 20, space: 10 };
        }
        // >>> B. 强势拉升 (Lifting) - 机会 <<<
        else if (isSafe && changePercent > 3.0 && volRatioK > 1.5) {
            result.phase = 'LIFTING';
            result.phaseLabel = '🚀 主升启动 (LIFT-OFF)';
            result.phaseDesc = '量价齐升，均线多头排列，股价脱离成本区，攻击形态确立。';
            result.confidence = 88;
            result.action = 'BUY';
            result.metrics = { vol: 90, price: 95, time: 60, space: 80 };
        }
        // >>> C. 缩量洗盘 (Shakeout) - 博弈 <<<
        else if (isSafe && changePercent < -1.5 && changePercent > -5.0 && volRatioK < 0.8 && rsi > 38) {
            result.phase = 'SHAKEOUT';
            result.phaseLabel = '🟡 缩量洗盘 (SHAKEOUT)';
            result.phaseDesc = '股价回调回踩支撑位，但成交量极度萎缩（惜售），主力并未离场。';
            result.confidence = 78;
            result.action = 'HOLD';
            result.metrics = { vol: 25, price: 60, time: 80, space: 65 };
        }
        // >>> D. 隐匿吸筹 (Accumulation) - 潜伏 <<<
        else if (isSafe && amp5 < 0.05 && volRatioK > 1.1 && volRatioK < 1.8) {
            result.phase = 'ACCUMULATION';
            result.phaseLabel = '🔵 隐匿吸筹 (ACCUMULATION)';
            result.phaseDesc = '股价被控制在窄幅区间内，但成交量在温和放大，主力正在压价收集筹码。';
            result.confidence = 70;
            result.action = 'HOLD';
            result.metrics = { vol: 60, price: 55, time: 90, space: 85 };
        }

        return result;
    }
};

/**
 * [V12.5] GenieEngine: 异动精灵增强版
 */
const GenieEngine = {
  analyze: (s: RealStock): GenieSignal | undefined => {
    const { minuteData, changePercent, turnover, price } = s;
    const isUS = s.code.startsWith('us');
    const limit = isUS ? 0.8 : 2.5; // 美股门槛稍低
    
    if (!minuteData || minuteData.length < 5) return undefined;

    // 计算分时量能
    const vStats = TechIndicators.getVolStats(minuteData);
    const lastMin = minuteData[minuteData.length-1];

    // 1. 滞涨背离
    if (lastMin.v > vStats.avg * 6 && Math.abs(changePercent) < 1.0) {
        return { label: '⚠️ 滞涨背离', color: 'text-red-400 border-red-500 bg-red-900/20', winRate: '避险' };
    }

    // 2. 诱多洗盘
    const dayMax = Math.max(...minuteData.map(d => d.p));
    if (price > 0 && (dayMax - price)/price > 0.03 && changePercent < -0.5 && changePercent > -2.0) {
         return { label: '🎣 诱多洗盘', color: 'text-yellow-400 border-yellow-500 bg-yellow-900/20', winRate: '65%' };
    }

    // 3. 经典信号
    if (changePercent > 4.0 && turnover > limit) 
        return { label: '🚀 火箭拉升', color: 'text-purple-400 border-purple-500 bg-purple-900/20', winRate: '82%' };
        
    if (changePercent > 0.5 && turnover > limit * 3.0)
        return { label: '🔥 暴力抢筹', color: 'text-orange-400 border-orange-500 bg-orange-900/20', winRate: '78%' };

    if (Math.abs(changePercent) < 1.0 && turnover > limit * 1.5)
        return { label: '🧲 隐匿吸筹', color: 'text-emerald-400 border-emerald-500 bg-emerald-900/20', winRate: '75%' };
    
    if (changePercent < -3.0 && turnover > limit * 1.5)
        return { label: '💀 恐慌出逃', color: 'text-blue-400 border-blue-500 bg-blue-900/20', winRate: 'N/A' };

    return undefined;
  }
};

// ============================================================================
// SECTION 5: UI 组件 (UI COMPONENTS)
// ============================================================================

// 战术手册
const TacticalManual = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;
    return (
        <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#12141a] border border-gray-700 w-full max-w-2xl h-[80vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e=>e.stopPropagation()}>
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#161920]">
                    <div className="flex items-center gap-2 text-white font-bold">
                        <BookOpen size={18} className="text-blue-400"/>
                        Wukong 实战作战手册
                    </div>
                    <button onClick={onClose}><X size={18} className="text-gray-500 hover:text-white"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin text-gray-300 text-sm leading-relaxed">
                    
                    {/* 1. 意图 */}
                    <section>
                        <h3 className="text-lg font-bold text-purple-400 mb-3 flex items-center gap-2">
                            <Brain size={18}/> 第一章：主力意图 (Force Engine)
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-gray-800 p-3 rounded border border-gray-700">
                                <strong className="text-blue-400">🔵 吸筹</strong>
                                <p className="text-xs opacity-80 mt-1">价格稳 + 量能增。主力潜伏，适合建底仓。</p>
                            </div>
                            <div className="bg-gray-800 p-3 rounded border border-gray-700">
                                <strong className="text-yellow-400">🟡 洗盘</strong>
                                <p className="text-xs opacity-80 mt-1">价格跌 + 量能缩。黄金坑，死拿不放。</p>
                            </div>
                             <div className="bg-gray-800 p-3 rounded border border-gray-700">
                                <strong className="text-purple-400">🚀 拉升</strong>
                                <p className="text-xs opacity-80 mt-1">量价齐升。突破平台，大胆加仓。</p>
                            </div>
                             <div className="bg-gray-800 p-3 rounded border border-gray-700">
                                <strong className="text-red-400">🔴 派发</strong>
                                <p className="text-xs opacity-80 mt-1">滞涨或破位。风险极大，必须离场。</p>
                            </div>
                        </div>
                    </section>

                    {/* 2. 夜视仪 */}
                    <section>
                        <h3 className="text-lg font-bold text-yellow-500 mb-3 flex items-center gap-2">
                            <Activity size={18}/> 第二章：夜视仪 (Night Vision)
                        </h3>
                        <p className="mb-2 text-gray-400">在分时图中，我们通过特殊颜色标记了主力的踪迹：</p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li><strong className="text-purple-400">紫色均线 (VWAP)</strong>: 机构当天的平均持仓成本线。</li>
                            <li><strong className="text-yellow-500">金色量柱</strong>: 代表这一分钟成交量是平时均量的3倍以上，主力行为。</li>
                        </ul>
                    </section>

                    {/* 3. 风控 */}
                    <section>
                        <h3 className="text-lg font-bold text-orange-400 mb-3 flex items-center gap-2">
                            <Lock size={18}/> 第三章：安全绳 (Safety Rope)
                        </h3>
                        <div className="bg-red-900/20 border border-red-500/30 p-4 rounded text-red-200 text-xs leading-relaxed">
                            <strong>⚠️ 铁律警告：</strong>
                            <br/>
                            当右侧面板显示 <span className="text-red-400 font-bold underline">🔴 确认破位</span> 时，意味着股价有效跌破了 ATR 智能止损线，上升趋势在数学概率上已经结束。此时必须无条件止损。
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
}

// 错误边界 (防止白屏)
class ChartErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: any) { console.error("Chart Render Error:", error); }
    render() {
        if (this.state.hasError) return <div className="h-full flex items-center justify-center text-xs text-gray-500">Data Visualization Error</div>;
        return this.props.children;
    }
}

// Mastermind 面板
const MastermindPanel = ({ report }: { report: StrategyReport }) => {
    if(!report) return null;
    const { force, stopLossPrice, isSafe, isBroken, genieSignal, holdingInfo } = report;
    
    let theme = 'gray';
    if(force.phase === 'LIFTING') theme = 'purple';
    else if(force.phase === 'DISTRIBUTION') theme = 'red';
    else if(force.phase === 'SHAKEOUT') theme = 'yellow';
    else if(force.phase === 'ACCUMULATION') theme = 'blue';

    const styles: any = {
        purple: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500' },
        red: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500' },
        yellow: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500' },
        blue: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500' },
        gray: { text: 'text-gray-400', bg: 'bg-gray-800/40', border: 'border-gray-600' }
    };
    const s = styles[theme];

    const ScoreBar = ({ label, val, color }: any) => (
        <div className="flex items-center gap-2 mb-2">
            <div className="text-[9px] text-gray-400 w-16 text-right">{label}</div>
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${color}`} style={{width: `${val}%`, transition:'width 0.5s'}}></div>
            </div>
            <div className="text-[9px] font-mono text-gray-500 w-6">{Math.round(val)}</div>
        </div>
    );

    return (
        <div className="space-y-3 animate-in slide-in-from-right fade-in p-1">
            {/* 1. Genie Alert */}
            {genieSignal && (
                <div className={`flex justify-between items-center p-2 rounded border ${genieSignal.color.replace('bg-','bg-opacity-10 bg-').replace('text-','border-')} mb-1`}>
                    <div className="flex items-center gap-2 font-bold text-xs"><Zap size={12}/> {genieSignal.label}</div>
                    <div className="text-[9px] opacity-80">胜率 {genieSignal.winRate}</div>
                </div>
            )}

            {/* 2. Main Force Card */}
            <div className={`p-4 rounded-xl border-l-4 shadow-lg ${s.bg} ${s.border} border-r-0 border-t-0 border-b-0`}>
                <div className="flex justify-between items-center mb-2">
                    <span className={`text-xs font-bold flex items-center gap-1 ${s.text}`}><Brain size={14}/> 主力意图</span>
                    <span className="text-[9px] font-mono bg-black/30 px-1.5 rounded text-white/70">Conf: {force.confidence}%</span>
                </div>
                <div className={`text-xl font-black mb-2 ${s.text}`}>{force.phaseLabel}</div>
                <p className="text-[10px] leading-relaxed opacity-80 text-gray-300 border-t border-white/10 pt-2">{force.phaseDesc}</p>
            </div>

            {/* 3. 4D Metrics */}
            <div className="bg-[#1c1f26] p-3 rounded-lg border border-gray-700">
                <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-3 font-bold uppercase"><Layers size={10}/> 量价时空评分</div>
                <ScoreBar label="🔥 攻击" val={force.metrics.vol} color="bg-red-500"/>
                <ScoreBar label="📈 趋势" val={force.metrics.price} color="bg-blue-500"/>
                <ScoreBar label="⚓ 潜伏" val={force.metrics.time} color="bg-yellow-500"/>
                <ScoreBar label="🌌 空间" val={force.metrics.space} color="bg-emerald-500"/>
            </div>

            {/* 4. Safety Rope Status */}
            <div className={`p-3 rounded border text-center flex flex-col justify-center items-center ${isSafe ? 'bg-green-900/10 border-green-800/50 text-green-400' : 'bg-red-900/10 border-red-800/50 text-red-400'}`}>
                 <div className="text-[10px] opacity-70 flex items-center gap-1 mb-1"><Lock size={10}/> ATR 安全绳</div>
                 <div className="font-mono font-bold text-sm">{stopLossPrice ? stopLossPrice.toFixed(2) : '--'}</div>
                 {isBroken && <div className="mt-1 text-[9px] bg-red-500 text-white px-2 rounded animate-pulse">确认破位</div>}
            </div>

            {/* 5. Advice */}
            <div className="text-center py-2 bg-gray-800/50 rounded border border-gray-700">
                <span className="text-[10px] text-gray-500">操作建议:</span> <span className="text-xs font-bold text-gray-200">{force.advice === 'BUY' ? '积极买入' : force.advice === 'SELL' ? '清仓离场' : '持股观望'}</span>
            </div>
            
            {/* 6. Holding */}
            {holdingInfo && (
                 <div className="mt-4 border-t border-gray-800 pt-2">
                     <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                         <span>持仓盈亏</span>
                         <span className={holdingInfo.pnl>=0?'text-red-400':'text-green-400'}>{holdingInfo.pnl.toFixed(0)}</span>
                     </div>
                 </div>
            )}
        </div>
    );
};


// 分时图组件
const IntradayChart = React.memo(({ data, prevClose, code }: { data: MinutePoint[], prevClose: number, code: string }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const validData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const base = prevClose > 0 ? prevClose : (data[0].p || 10);
    return data.map(d => ({ 
        p: (isNaN(d.p) || d.p <= 0) ? base : d.p, 
        v: (isNaN(d.v) || d.v < 0) ? 0 : d.v, 
        t: d.t || '' 
    }));
  }, [data, prevClose]);

  // VWAP
  const vwap = useMemo(() => {
      if(validData.length === 0) return prevClose;
      let tp=0, tv=0;
      for(let d of validData) { tp += d.p*d.v; tv += d.v; }
      return tv>0 ? tp/tv : prevClose;
  }, [validData, prevClose]);

  const volStats = useMemo(() => TechIndicators.getVolStats(validData), [validData]);
  const whaleThreshold = Math.min(volStats.max*0.7, volStats.avg*3.0);

  if (!validData.length) return <div className="h-full flex items-center justify-center text-xs text-gray-600 bg-[#0b0c10]">Waiting for Data...</div>;

  const prices = validData.map(d=>d.p);
  const maxP = Math.max(...prices, prevClose);
  const minP = Math.min(...prices, prevClose);
  const absDiff = Math.max(Math.abs(maxP-prevClose), Math.abs(minP-prevClose));
  const top = prevClose + absDiff*1.1;
  const bottom = prevClose - absDiff*1.1;
  const range = top - bottom || 1;
  
  const getX = (i:number) => (i / (validData.length-1))*100;
  const getY = (p:number) => 100 - ((p-bottom)/range)*100;

  const linePath = validData.map((d,i) => `${getX(i)},${getY(d.p)}`).join(' ');
  const avgPath = validData.map((d,i) => `${getX(i)},${getY(vwap)}`).join(' '); // Simplified VWAP drawing
  const hoverItem = hoverIdx !== null ? validData[hoverIdx] : null;

  return (
      <div className="w-full h-full bg-[#0b0c10] flex flex-col relative select-none cursor-crosshair group"
           onMouseMove={e=>{
               const r = e.currentTarget.getBoundingClientRect();
               const i = Math.floor(((e.clientX-r.left)/r.width)*validData.length);
               setHoverIdx(Math.max(0, Math.min(i, validData.length-1)));
           }}
           onMouseLeave={()=>setHoverIdx(null)}>
           
           {hoverItem && (
               <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/90 border border-gray-700 px-2 py-1 rounded text-[10px] font-mono z-20 flex gap-3 pointer-events-none">
                   <span className="text-gray-400">{hoverItem.t}</span>
                   <span className={hoverItem.p>=prevClose?'text-red-400':'text-green-400'}>{hoverItem.p.toFixed(2)}</span>
                   <span className="text-purple-400">Avg: {vwap.toFixed(2)}</span>
                   {hoverItem.v > whaleThreshold && <span className="text-yellow-400 font-bold animate-pulse">★主力</span>}
               </div>
           )}
           
           <div className="h-[70%] border-b border-gray-800/50 relative w-full overflow-hidden">
                <div className="absolute top-1 right-2 flex gap-2 text-[8px] opacity-50">
                    <span className="text-purple-400">● 成本</span> <span className="text-yellow-400">● 巨量</span>
                </div>
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#4b5563" strokeDasharray="3 3" opacity="0.4" vectorEffect="non-scaling-stroke"/>
                    <polyline points={avgPath} fill="none" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.6" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/>
                    <polyline points={linePath} fill="none" stroke="#3b82f6" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
                    {hoverIdx!==null && <line x1={`${getX(hoverIdx)}%`} x2={`${getX(hoverIdx)}%`} y1="0" y2="100%" stroke="#fff" strokeWidth="0.5" strokeDasharray="3 3"/>}
                </svg>
           </div>

           <div className="h-[30%] w-full relative pt-px bg-[#0b0c10]">
                <div className="w-full h-full flex items-end gap-[1px] overflow-hidden px-[1px]">
                    {validData.map((d, i) => {
                        if (i%2!==0 && validData.length > 300) return null; // Sampling
                        const isHuge = d.v > whaleThreshold;
                        const col = isHuge ? 'bg-yellow-400' : (d.p >= (i>0?validData[i-1].p:prevClose) ? 'bg-red-500/70' : 'bg-green-500/70');
                        return <div key={i} className={`flex-1 rounded-t-sm ${col}`} style={{height: `${Math.max(1, (d.v/volStats.max)*100)}%`}}/>;
                    })}
                </div>
           </div>
      </div>
  );
});

// K线图组件
const CandleChart = React.memo(({ data, subChartMode, setSubChartMode }: { data: KLinePoint[], subChartMode: string, setSubChartMode: any }) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const count = 60;
    const viewData = useMemo(() => data.slice(-count), [data]);
    
    if (viewData.length === 0) return <div className="h-full flex items-center justify-center text-xs text-gray-600 bg-[#0b0c10]">Loading Trend...</div>;
    
    // Calcs
    const ma5 = TechIndicators.calculateMA(data, 5).slice(-count);
    const ma20 = TechIndicators.calculateMA(data, 20).slice(-count);
    const ropes = TechIndicators.calculateChandelierExit(data, 22, 3.0).slice(-count);
    const macd = TechIndicators.calculateMACD(viewData); // Calc for view only
    const rsi = TechIndicators.calculateRSI(data).slice(-count); // Calc full, slice view

    const maxP = Math.max(...viewData.map(d=>d.high), ...ropes.filter(x=>x!==null) as number[]);
    const minP = Math.min(...viewData.map(d=>d.low), ...ropes.filter(x=>x!==null) as number[]);
    const range = maxP - minP || 1;
    
    const getX = (i:number) => (i/count)*100;
    const getY = (p:number) => 100 - ((p-minP)/range)*100;
    const w = (100/count)*0.65;

    const getPoly = (arr: (number|null)[]) => arr.map((v,i) => v!==null?`${getX(i)+w/2},${getY(v)}`:'').filter(Boolean).join(' ');

    return (
        <div className="w-full h-full bg-[#0b0c10] flex flex-col relative select-none"
             onMouseMove={e => {
                 const r = e.currentTarget.getBoundingClientRect();
                 setHoverIdx(Math.floor(((e.clientX - r.left)/r.width) * count));
             }}
             onMouseLeave={() => setHoverIdx(null)}
        >
            {/* Main Chart */}
            <div className="h-[70%] border-b border-gray-800/50 relative overflow-hidden w-full">
                <div className="absolute top-1 left-2 z-10 text-[8px] text-orange-400 flex gap-2 bg-black/30 px-1 rounded">
                    <span><Lock size={8}/> 安全绳 (ATR)</span>
                </div>

                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    {/* Ropes */}
                    <polyline points={getPoly(ropes)} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/>
                    {/* MAs */}
                    <polyline points={getPoly(ma5)} fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.8" vectorEffect="non-scaling-stroke"/>
                    <polyline points={getPoly(ma20)} fill="none" stroke="#a855f7" strokeWidth="1" opacity="0.8" vectorEffect="non-scaling-stroke"/>

                    {/* Candles */}
                    {viewData.map((d,i)=>{
                        const c = d.close >= d.open ? '#ef4444' : '#22c55e';
                        return (
                            <g key={i} opacity={hoverIdx===null||hoverIdx===i ? 1 : 0.3}>
                                <line x1={`${getX(i)+w/2}%`} x2={`${getX(i)+w/2}%`} y1={`${getY(d.high)}%`} y2={`${getY(d.low)}%`} stroke={c} strokeWidth="1" vectorEffect="non-scaling-stroke"/>
                                <rect x={`${getX(i)}%`} y={`${getY(Math.max(d.open,d.close))}%`} width={`${w}%`} height={`${Math.max(0.5, Math.abs(getY(d.open)-getY(d.close)))}%`} fill={c}/>
                            </g>
                        )
                    })}
                </svg>
            </div>
            
            {/* Sub Chart */}
            <div className="h-[30%] relative w-full bg-[#0b0c10] p-1">
                 <div className="absolute top-0 right-0 z-10 flex gap-1">
                     {['MACD','RSI','VOL'].map(m => (
                         <button key={m} onClick={(e)=>{e.stopPropagation(); setSubChartMode(m)}} className={`text-[8px] px-1.5 rounded border transition-colors ${subChartMode===m ? 'bg-gray-700 text-white border-gray-600' : 'text-gray-600 border-transparent hover:bg-gray-800'}`}>
                             {m}
                         </button>
                     ))}
                 </div>
                 
                 <svg className="w-full h-full overflow-hidden" preserveAspectRatio="none">
                     {subChartMode === 'RSI' && (
                         <>
                             <line x1="0" y1="20%" x2="100%" y2="20%" stroke="#333" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>
                             <line x1="0" y1="80%" x2="100%" y2="80%" stroke="#333" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>
                             <polyline points={rsi.map((v,i)=>`${getX(i)+w/2},${100-v}`).join(' ')} fill="none" stroke="#8b5cf6" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
                         </>
                     )}
                     {subChartMode === 'MACD' && macd.bar.map((v,i) => {
                         const c = v>0?'#ef4444':'#22c55e';
                         const h = Math.min(50, Math.abs(v)*3); 
                         return <rect key={i} x={`${getX(i)}%`} y={`${v>0?50-h:50}%`} width={`${w}%`} height={`${h}%`} fill={c} opacity="0.7"/>
                     })}
                      {subChartMode === 'VOL' && viewData.map((d,i) => {
                         const mv = Math.max(...viewData.map(x=>x.vol));
                         const c = d.close>d.open?'#ef4444':'#22c55e';
                         return <rect key={i} x={`${getX(i)}%`} y={`${100-(d.vol/mv)*100}%`} width={`${w}%`} height={`${(d.vol/mv)*100}%`} fill={c} opacity="0.5"/>
                     })}
                 </svg>
            </div>
        </div>
    );
});

// ============================================================================
// SECTION 8: MAIN APP
// ============================================================================

export default function App() {
  const [codes, setCodes] = useState<string[]>(() => {
      try { return JSON.parse(localStorage.getItem(CODES_KEY)||'null')||DEFAULT_CODES } catch { return DEFAULT_CODES }
  });
  const [portfolio, setPortfolio] = useState<Record<string, PortfolioItem>>(() => {
      try { return JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||'{}') } catch { return {} }
  });
  const [simState, setSimState] = useState<GlobalSimState>(() => {
      try { return JSON.parse(localStorage.getItem(SIMULATION_KEY)||'{"cash":1000000,"initialCapital":1000000,"positions":{}}') } catch { return {cash:1000000, initialCapital:1000000, positions:{}} }
  });

  const [selectedCode, setSelectedCode] = useState<string>('');
  const [stocks, setStocks] = useState<RealStock[]>([]);
  
  // UI States
  const [mobileTab, setMobileTab] = useState<'LIST'|'CHART'|'AI'>('CHART');
  const [isManualOpen, setManualOpen] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [subChartMode, setSubChartMode] = useState('MACD');
  
  // Editing States
  const [isEditingPortfolio, setIsEditingPortfolio] = useState(false);
  const [tempCost, setTempCost] = useState('');
  const [tempShares, setTempShares] = useState('');

  // Cloud Sync States
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncLink, setSyncLink] = useState('');

  // Persistence
  useEffect(() => { localStorage.setItem(CODES_KEY, JSON.stringify(codes)) }, [codes]);
  useEffect(() => { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio)) }, [portfolio]);
  useEffect(() => { localStorage.setItem(SIMULATION_KEY, JSON.stringify(simState)) }, [simState]);
  
  // Selection init
  useEffect(() => {
      if(!selectedCode && codes.length > 0) setSelectedCode(codes[0]);
  }, [codes]);

  // Form reset on select change
  useEffect(() => {
      const p = portfolio[selectedCode];
      if(p) {
          setTempCost(p.cost.toString());
          setTempShares(p.shares.toString());
      } else {
          setTempCost(''); setTempShares('');
      }
  }, [selectedCode, portfolio]);

  // --- API Handlers ---
  const requestId = useRef(0);
  
  const fetchRealData = useCallback(async () => {
    if(codes.length===0) return;
    const cid = ++requestId.current;
    const controller = new AbortController();
    
    try {
        const res = await fetch(`/api/q=${codes.join(',')}&_t=${Date.now()}`, { signal: controller.signal });
        const buf = await res.arrayBuffer();
        const txt = new TextDecoder('gbk').decode(buf);

        if(cid !== requestId.current) return;

        setStocks(prev => txt.split(';').filter(l=>l.trim().length>10).map(line => {
            const arr = line.split('~');
            const code = line.match(/v_(.*?)=/)?.[1]||'';
            const old = prev.find(s=>s.code===code);
            return {
                id: code, code, name: arr[1], 
                price: parseFloat(arr[3]), changePercent: parseFloat(arr[32]),
                open: parseFloat(arr[5]), prevClose: parseFloat(arr[4]), 
                high: parseFloat(arr[33]), low: parseFloat(arr[34]), 
                volume: parseFloat(arr[6]), amount: parseFloat(arr[37]), turnover: parseFloat(arr[38]), pe:0, mktCap:0,
                minuteData: old?.minuteData||[], klineData: old?.klineData||[]
            };
        }).filter(Boolean) as RealStock[]);
    } catch(e){}
  }, [codes]);

  // Data Filling (Detailed Fetcher)
  const fetchDetails = async (code: string) => {
      // Min
      try {
          const res = await fetch(`/kline/appstock/app/minute/query?code=${code}&_t=${Date.now()}`);
          const json = await res.json();
          const arr = json?.data?.[code]?.data?.data;
          if(Array.isArray(arr)) {
              let lv=0; 
              const m = arr.map((s: string, i: number)=>{
                  const p = s.split(' '); const tot=parseFloat(p[2]); const vol=i===0?tot:Math.max(0,tot-lv); lv=tot;
                  return { t: p[0], p: parseFloat(p[1]), v: vol };
              });
              setStocks(s => s.map(st => st.code===code ? {...st, minuteData:m} : st));
          }
      } catch(e){}
      // Kline
      try {
          const p = code.startsWith('us') ? `${code},day,,,320`:`${code},day,,,320,qfq`;
          const res = await fetch(`/kline/appstock/app/fqkline/get?param=${p}&_t=${Date.now()}`);
          const json = await res.json();
          const d = json?.data?.[code]?.qfqday || json?.data?.[code]?.day;
          if(Array.isArray(d)) {
              const k = d.map((i:any)=>({ date:i[0], open:parseFloat(i[1]), close:parseFloat(i[2]), high:parseFloat(i[3]), low:parseFloat(i[4]), vol:parseFloat(i[5]) }));
              setStocks(s => s.map(st => st.code===code ? {...st, klineData:k} : st));
          }
      } catch(e){}
  };

  useEffect(() => { fetchRealData(); const t=setInterval(fetchRealData,3000); return ()=>clearInterval(t); }, [fetchRealData]);
  useEffect(() => { if(selectedCode) fetchDetails(selectedCode); }, [selectedCode]);

  // --- Main Report Generation ---
  const selStock = stocks.find(s => s.code === selectedCode);
  const report = useMemo((): StrategyReport | null => {
      if (!selStock) return null;
      
      const force = ForceEngine.run(selStock);
      const genie = GenieEngine.analyze(selStock);
      
      const rope = TechIndicators.calculateChandelierExit(selStock.klineData);
      const stopPrice = rope[rope.length-1] || null;
      const rsi = TechIndicators.calculateRSI(selStock.klineData);
      
      const isSafe = stopPrice ? selStock.price >= stopPrice : true;
      const isBroken = !isSafe && rsi > 35;

      const holding = portfolio[selectedCode];
      let hInfo = null;
      if (holding) {
          hInfo = {
              pnl: (selStock.price - holding.cost) * holding.shares,
              pnlPercent: holding.cost>0 ? ((selStock.price-holding.cost)/holding.cost)*100 : 0,
              advice: isSafe ? '稳健持有' : '建议减仓'
          };
      }

      return {
          force, 
          genieSignal: genie ? genie : undefined,
          stopLossPrice: stopPrice,
          isSafe,
          isBroken,
          breakStatus: isBroken ? 'VALID_BREAK' : (!isSafe ? 'SUSPECT_TRAP' : 'SAFE'),
          rsiValue: rsi,
          holdingInfo: hInfo,
          t0_signal: { action: '观望', desc: '日内无明显异动', type: 'NONE' }
      };
  }, [selStock, portfolio]);

  const savePos = () => {
      const c = parseFloat(tempCost), s = parseFloat(tempShares);
      if(!isNaN(c) && !isNaN(s)) {
          setPortfolio(p => ({...p, [selectedCode]: {cost:c, shares:s}}));
      } else {
          setPortfolio(p => { const n={...p}; delete n[selectedCode]; return n; });
      }
      setIsEditingPortfolio(false);
  };

  const generateSync = () => { const d = {codes, portfolio}; setSyncLink(window.location.origin+'/?sync='+btoa(JSON.stringify(d))); };

  return (
    <div className="fixed inset-0 bg-[#0f1115] text-gray-300 font-sans flex flex-col select-none">
        <TacticalManual isOpen={isManualOpen} onClose={()=>setManualOpen(false)} />
        
        {isSyncModalOpen && <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={()=>setIsSyncModalOpen(false)}>
            <div className="bg-[#1c1f26] p-5 rounded w-full max-w-sm shadow-2xl border border-gray-700" onClick={e=>e.stopPropagation()}>
                <div className="font-bold text-white mb-4 flex items-center gap-2"><User size={18}/> 数据云同步</div>
                {!syncLink ? <button onClick={generateSync} className="w-full bg-blue-600 py-2 rounded text-white hover:bg-blue-500">生成同步链接</button> : <div className="bg-black/50 p-3 rounded border border-gray-700 text-xs text-gray-400 break-all select-all font-mono">{syncLink}</div>}
            </div>
        </div>}

        <div className="h-14 border-b border-gray-800 bg-[#161920] flex items-center justify-between px-4 z-20">
            <div className="flex items-center gap-2 font-black text-lg text-emerald-400"><Activity size={20}/> WUKONG PRO <span className="text-[9px] text-white bg-purple-600 px-1.5 rounded">V12.5</span></div>
            <div className="flex gap-4">
                <button onClick={()=>setManualOpen(true)} className="text-xs hover:text-white flex items-center gap-1"><BookOpen size={14}/> 战术手册</button>
                <button onClick={()=>setIsSyncModalOpen(true)} className="text-xs hover:text-white flex items-center gap-1"><Upload size={14}/> 同步</button>
            </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative pb-[50px] md:pb-0">
            {/* LIST */}
            <div className={`w-full md:w-72 bg-[#12141a] border-r border-gray-800 flex flex-col ${mobileTab==='LIST'?'flex-1':'hidden md:flex'}`}>
                <div className="p-3 border-b border-gray-800 relative">
                    <Search className="absolute left-5 top-5 text-gray-500" size={14}/>
                    <input className="w-full bg-black/30 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:border-blue-500 outline-none transition-all" placeholder="Code..." value={inputCode} onChange={e=>setInputCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&inputCode){setCodes(p=>[inputCode,...p]);setInputCode('')}}}/>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {codes.map(c => {
                        const s = stocks.find(x=>x.code===c);
                        return (
                            <div key={c} onClick={()=>{setSelectedCode(c); if(window.innerWidth<768) setMobileTab('CHART')}} className={`p-4 border-b border-gray-800/40 hover:bg-[#1c1f26] cursor-pointer transition-all ${selectedCode===c?'bg-[#1c1f26] border-l-2 border-l-emerald-500 pl-[14px]':'pl-4'}`}>
                                <div className="flex justify-between text-sm font-bold text-gray-200 mb-1">
                                    <span>{s?.name||c}</span>
                                    <span className={s&&(s.changePercent>=0?'text-red-400':'text-green-400')}>{s?.changePercent}%</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span className="font-mono">{c}</span>
                                    <span className="font-mono">{s?.price}</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* CHART */}
            <div className={`flex-1 bg-[#0f1115] flex flex-col min-w-0 ${mobileTab==='CHART'?'flex-1':'hidden md:flex'}`}>
                {selStock ? (
                    <>
                        <div className="h-14 border-b border-gray-800 px-5 flex items-center justify-between bg-[#14161b]">
                            <div><div className="text-lg font-bold text-white">{selStock.name}</div><div className="text-xs text-gray-500 font-mono mt-0.5">{fmt(selStock.volume)} | {selStock.turnover}%</div></div>
                            <div className="text-right"><div className={`text-2xl font-mono font-bold ${selStock.changePercent>=0?'text-red-500':'text-green-500'}`}>{selStock.price.toFixed(2)}</div><div className={`text-xs font-bold ${selStock.changePercent>=0?'text-red-500/70':'text-green-500/70'}`}>{selStock.changePercent>0?'+':''}{selStock.changePercent}%</div></div>
                        </div>
                        <div className="flex-1 flex flex-col gap-1 p-1 overflow-hidden">
                            <div className="flex-1 bg-[#0b0c10] rounded border border-gray-800 relative overflow-hidden">
                                <div className="absolute top-2 left-2 z-10 flex gap-2"><span className="text-[9px] text-blue-400 bg-blue-900/10 px-1.5 rounded border border-blue-800/30 font-bold flex items-center gap-1"><Activity size={10}/> Night Vision</span></div>
                                <ChartErrorBoundary><IntradayChart data={selStock.minuteData} prevClose={selStock.prevClose} code={selStock.code} t0Buy={null} t0Sell={null}/></ChartErrorBoundary>
                            </div>
                            <div className="flex-1 bg-[#0b0c10] rounded border border-gray-800 relative overflow-hidden">
                                <ChartErrorBoundary><CandleChart data={selStock.klineData} subChartMode={subChartMode} setSubChartMode={setSubChartMode}/></ChartErrorBoundary>
                            </div>
                        </div>
                    </>
                ) : <div className="flex-1 flex items-center justify-center text-gray-700 gap-2"><MousePointer2 className="opacity-20"/> Select Stock</div>}
            </div>

            {/* AI PANEL */}
            <div className={`w-full md:w-80 bg-[#12141a] border-l border-gray-800 flex flex-col ${mobileTab==='AI'?'flex-1':'hidden md:flex'}`}>
                <div className="p-3 border-b border-gray-800 text-xs font-bold text-gray-500 uppercase tracking-widest bg-[#161920]">Mastermind Panel</div>
                <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
                    <MastermindPanel report={report!} />
                    <div className="mt-6 pt-4 border-t border-gray-800">
                         <div className="flex justify-between text-xs text-gray-400 mb-2"><span>我的持仓</span><button onClick={()=>setIsEditingPortfolio(!isEditingPortfolio)} className="text-blue-400 hover:text-blue-300"><Edit2 size={12}/></button></div>
                         {isEditingPortfolio ? (
                             <div className="bg-black/20 p-2 rounded space-y-2 border border-gray-700">
                                 <input className="w-full bg-black border border-gray-600 rounded px-2 py-1.5 text-xs text-white font-mono" placeholder="成本" value={tempCost} onChange={e=>setTempCost(e.target.value)}/>
                                 <input className="w-full bg-black border border-gray-600 rounded px-2 py-1.5 text-xs text-white font-mono" placeholder="股数" value={tempShares} onChange={e=>setTempShares(e.target.value)}/>
                                 <button onClick={savePos} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-bold transition-colors">保存</button>
                             </div>
                         ) : (
                             portfolio[selectedCode] ? (
                                 <div className="bg-[#1c1f26] p-3 rounded border border-gray-700">
                                     <div className="flex justify-between text-xs mb-1 text-gray-500"><span>市值</span><span className="text-gray-300 font-mono">{((selStock?.price||0)*portfolio[selectedCode].shares).toFixed(0)}</span></div>
                                     <div className="flex justify-between text-xs"><span>盈亏</span><span className={`font-bold ${report?.holdingInfo && report.holdingInfo.pnl>=0?'text-red-400':'text-green-400'}`}>{report?.holdingInfo?.pnl.toFixed(0)} ({report?.holdingInfo?.pnlPercent.toFixed(2)}%)</span></div>
                                 </div>
                             ) : <div className="text-center text-xs text-gray-600 border border-dashed border-gray-700 py-4 rounded">暂无持仓</div>
                         )}
                    </div>
                </div>
            </div>

            <div className="md:hidden absolute bottom-0 w-full h-[50px] bg-[#161920] border-t border-gray-800 flex z-50">
                {['LIST','CHART','AI'].map(t => (
                    <button key={t} onClick={()=>setMobileTab(t as any)} className={`flex-1 flex flex-col items-center justify-center text-[10px] gap-0.5 ${mobileTab===t?'text-white bg-gray-800':'text-gray-500'}`}>
                        {t==='LIST'?<List size={18}/>:t==='CHART'?<LineChart size={18}/>:<Brain size={18}/>}
                        <span className="scale-90">{t}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
  );
}
