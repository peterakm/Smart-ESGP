import { ICON, IconEnvironment, IconFarmers, IconGovernance, type AppIcon } from '../icons';
import {
 calculateSmartEsgpEsgCategoryScore,
 formatSmartEsgpEsgPoints,
 type SmartEsgpEsgCategory,
 type SmartEsgpEsgCategoryId,
 type SmartEsgpLanguage,
} from '../../domain/esgPractices';

interface EsgScoreBreakdownProps {
 categories: SmartEsgpEsgCategory[];
 language: SmartEsgpLanguage;
}

interface EsgBreakdownStyle {
 barClass: string;
 iconClass: string;
 metMarkerClass: string;
 label: Record<SmartEsgpLanguage, string>;
}

const ESG_BREAKDOWN_STYLES: Record<SmartEsgpEsgCategoryId, EsgBreakdownStyle> = {
 E: {
 barClass: 'bg-emerald-500',
 iconClass: 'text-emerald-600',
 metMarkerClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
 label: {
 EN: 'Environmental (E)',
 BM: 'Alam Sekitar (E)',
 },
 },
 S: {
 barClass: 'bg-indigo-500',
 iconClass: 'text-indigo-600',
 metMarkerClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
 label: {
 EN: 'Social (S)',
 BM: 'Sosial (S)',
 },
 },
 G: {
 barClass: 'bg-amber-500',
 iconClass: 'text-amber-600',
 metMarkerClass: 'bg-amber-50 text-amber-700 border-amber-200',
 label: {
 EN: 'Governance (G)',
 BM: 'Tadbir Urus (G)',
 },
 },
};

const ESG_ICONS = {
 E: IconEnvironment,
 S: IconFarmers,
 G: IconGovernance,
} satisfies Record<SmartEsgpEsgCategoryId, AppIcon>;

const formatPartSummary = (category: SmartEsgpEsgCategory, language: SmartEsgpLanguage): string => {
 const points = formatSmartEsgpEsgPoints(category.pointsPerPractice);

 return language === 'EN'
 ? `${category.items.length} field checks. Each completed check is worth ${points} points.`
 : `${category.items.length} semakan kebun. Setiap semakan lengkap bernilai ${points} mata.`;
};

export const EsgScoreBreakdown = ({ categories, language }: EsgScoreBreakdownProps) => {
 return (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 {categories.map((category) => {
 const score = calculateSmartEsgpEsgCategoryScore(category);
 const scoreLabel = formatSmartEsgpEsgPoints(score);
 const pointLabel = formatSmartEsgpEsgPoints(category.pointsPerPractice);
 const progress = Math.min((score / category.maxPoints) * 100, 100);
 const style = ESG_BREAKDOWN_STYLES[category.id];
 const Icon = ESG_ICONS[category.id];

 return (
 <div
 key={category.id}
 className="border border-slate-200 rounded-xl p-4 bg-slate-50/45 hover:bg-slate-50 transition-colors flex flex-col justify-between"
 >
 <div>
 <div className="flex justify-between items-center mb-2">
 <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
 <Icon className={`${ICON.STATUS} ${style.iconClass}`} aria-hidden="true" />
 <span>{style.label[language]}</span>
 </span>
 <span className={`text-xs font-semibold ${style.iconClass}`}>
 {scoreLabel} / {category.maxPoints} pts
 </span>
 </div>

 <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
 <div
 className={`${style.barClass} h-full transition-all duration-500 rounded-full`}
 style={{ width: `${progress}%` }}
 />
 </div>

 <span className="text-xs text-slate-500 mt-2 block leading-relaxed font-sans">
 {formatPartSummary(category, language)}
 </span>
 </div>

 <div className="flex gap-1 mt-4">
 {category.items.map((item, index) => (
 <div
 key={item.name}
 className={`h-7 px-1 text-xs font-medium flex flex-col items-center justify-center rounded border transition-colors flex-grow ${
 item.met ? style.metMarkerClass : 'bg-slate-100 text-slate-400 border-slate-200/60'
 }`}
 title={item.name}
 >
 <span>
 {category.id}
 {index + 1}
 </span>
 <span className="text-xs font-normal leading-none mt-0.5">
 {item.met ? `+${pointLabel}` : '0'}
 </span>
 </div>
 ))}
 </div>
 </div>
 );
 })}
 </div>
 );
};
