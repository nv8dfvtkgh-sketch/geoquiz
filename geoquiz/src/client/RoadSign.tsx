// Panneaux du code de la route, redessinés d'après la convention de Vienne (utilisée au Maroc).
const RED = '#C8102E', BLUE = '#1F5FBF', YEL = '#FFC20E', INK = '#1D1D1F', W = '#FFFFFF';

function Triangle({ children }: { children?: React.ReactNode }) {
  return <><path d="M50 8 L94 86 L6 86 Z" fill={W} stroke={RED} strokeWidth="8" strokeLinejoin="round" />{children}</>;
}
function Round({ fill = W, ring = RED, children }: { fill?: string; ring?: string; children?: React.ReactNode }) {
  return <><circle cx="50" cy="50" r="42" fill={fill} stroke={ring} strokeWidth={ring === 'none' ? 0 : 9} />{children}</>;
}
const arrow = (d: string, sw = 9) => <path d={d} fill="none" stroke={W} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;

const SIGNS: Record<string, React.ReactNode> = {
  stop: <><path d="M33 8h34l25 25v34L67 92H33L8 67V33z" fill={RED} stroke={W} strokeWidth="3" /><text x="50" y="59" textAnchor="middle" fontSize="25" fontWeight="800" fill={W} fontFamily="Arial, sans-serif">STOP</text></>,
  yield: <path d="M8 14 L92 14 L50 90 Z" fill={W} stroke={RED} strokeWidth="9" strokeLinejoin="round" />,
  noentry: <Round fill={RED} ring="none"><rect x="20" y="42" width="60" height="16" rx="2" fill={W} /></Round>,
  speed60: <Round><text x="50" y="62" textAnchor="middle" fontSize="34" fontWeight="800" fill={INK} fontFamily="Arial, sans-serif">60</text></Round>,
  noparking: <Round fill={BLUE}><path d="M22 22 L78 78" stroke={RED} strokeWidth="9" /></Round>,
  nostopping: <Round fill={BLUE}><path d="M22 22 L78 78 M78 22 L22 78" stroke={RED} strokeWidth="9" /></Round>,
  priority: <><path d="M50 6 L94 50 L50 94 L6 50 Z" fill={W} stroke="#BBB" strokeWidth="1.5" /><path d="M50 22 L78 50 L50 78 L22 50 Z" fill={YEL} /></>,
  endpriority: <><path d="M50 6 L94 50 L50 94 L6 50 Z" fill={W} stroke="#BBB" strokeWidth="1.5" /><path d="M50 22 L78 50 L50 78 L22 50 Z" fill={YEL} /><path d="M30 70 L70 30" stroke={INK} strokeWidth="7" /></>,
  crossroads: <Triangle><path d="M50 36 V76 M34 56 H66" stroke={INK} strokeWidth="8" strokeLinecap="round" /></Triangle>,
  roundabout: <Round fill={BLUE} ring="none">{arrow('M50 28 A22 22 0 0 1 70 58')}{arrow('M66 70 A22 22 0 0 1 30 62')}{arrow('M32 50 A22 22 0 0 1 44 29')}<path d="M68 51 l6 9 -10 2z M27 64 l-1 -11 9 6z M40 25 l10 1 -6 9z" fill={W} /></Round>,
  turnright: <Round fill={BLUE} ring="none">{arrow('M38 74 V50 Q38 40 48 40 H64')}<path d="M60 28 L76 40 L60 52 Z" fill={W} /></Round>,
  oneway: <><rect x="8" y="26" width="84" height="48" rx="5" fill={BLUE} /><path d="M18 50 H70" stroke={W} strokeWidth="10" /><path d="M64 34 L84 50 L64 66 Z" fill={W} /></>,
  parking: <><rect x="10" y="10" width="80" height="80" rx="8" fill={BLUE} /><text x="50" y="71" textAnchor="middle" fontSize="58" fontWeight="800" fill={W} fontFamily="Arial, sans-serif">P</text></>,
  hospital: <><rect x="10" y="10" width="80" height="80" rx="8" fill={BLUE} /><text x="50" y="71" textAnchor="middle" fontSize="58" fontWeight="800" fill={W} fontFamily="Arial, sans-serif">H</text></>,
  bendright: <Triangle><path d="M40 78 V62 Q40 50 52 46 L60 43" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" /><path d="M56 34 L70 42 L58 52 Z" fill={INK} /></Triangle>,
  lights: <Triangle><rect x="40" y="34" width="20" height="46" rx="5" fill={INK} /><circle cx="50" cy="42" r="5" fill="#E53935" /><circle cx="50" cy="57" r="5" fill="#FFB300" /><circle cx="50" cy="72" r="5" fill="#43A047" /></Triangle>,
  bump: <Triangle><path d="M22 74 H36 Q50 50 64 74 H78" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></Triangle>,
  twoway: <Triangle><path d="M40 78 V44 M60 40 V74" stroke={INK} strokeWidth="6" /><path d="M33 48 L40 36 L47 48 Z M53 70 L60 82 L67 70 Z" fill={INK} /></Triangle>,
  levelcrossing: <Triangle><path d="M24 60 H76 M24 72 H76 M30 54 V78 M50 54 V78 M70 54 V78" stroke={INK} strokeWidth="5" /></Triangle>,
  nouturn: <Round><path d="M58 76 V46 Q58 32 45 32 Q34 32 34 46 V60" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" /><path d="M26 56 L34 70 L42 56 Z" fill={INK} /><path d="M22 22 L78 78" stroke={RED} strokeWidth="8" /></Round>,
  pedestrians: <><rect x="10" y="10" width="80" height="80" rx="8" fill={BLUE} /><path d="M50 18 L84 80 L16 80 Z" fill={W} /><path d="M28 74 H72" stroke={INK} strokeWidth="4" strokeDasharray="6 4" /><circle cx="52" cy="38" r="5" fill={INK} /><path d="M51 44 L47 58 L40 70 M47 58 L56 68 M49 49 L58 55 M49 49 L42 54" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" /></>,
};

export function RoadSign({ id }: { id: string }) {
  const s = SIGNS[id];
  if (!s) return null;
  return <svg className="road-sign" viewBox="0 0 100 100" role="img" aria-label="">{s}</svg>;
}
