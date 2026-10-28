import React, { useMemo } from 'react';
import { Waypoint } from '../types';

type PolygonMapLanguage = 'EN' | 'BM';

interface PolygonMapProps {
 waypoints: Waypoint[];
 className?: string;
 isFlagged?: boolean;
 language?: PolygonMapLanguage;
}

const POLYGON_MAP_COPY = {
 EN: {
 noGps: 'No GPS coordinates captured yet',
 accumulator: 'Plot boundary',
 waypointsCollected: (count: number) => `${count} waypoints collected`,
 gpsAccuracy: '+/-4m GPS accuracy',
 coverageCenter: 'Center point',
 computedArea: 'Calculated area',
 },
 BM: {
 noGps: 'Tiada koordinat GPS direkodkan lagi',
 accumulator: 'Sempadan plot',
 waypointsCollected: (count: number) => `${count} titik laluan dikumpul`,
 gpsAccuracy: 'Ketepatan GPS +/-4m',
 coverageCenter: 'Titik tengah',
 computedArea: 'Keluasan dikira',
 },
} satisfies Record<PolygonMapLanguage, {
 noGps: string;
 accumulator: string;
 waypointsCollected: (count: number) => string;
 gpsAccuracy: string;
 coverageCenter: string;
 computedArea: string;
}>;

const METERS_PER_DEGREE_LAT = 111_320;

const computeAreaHectares = (points: Array<Pick<Waypoint, 'lat' | 'lng'>>) => {
 if (points.length < 3) return 0;

 const refLatRad = (points.reduce((sum, point) => sum + point.lat, 0) / points.length) * (Math.PI / 180);
 const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(refLatRad);
 const projected = points.map((point) => ({
 x: point.lng * metersPerDegreeLng,
 y: point.lat * METERS_PER_DEGREE_LAT,
 }));

 const areaSquareMeters = Math.abs(projected.reduce((sum, point, index) => {
 const next = projected[(index + 1) % projected.length];
 return sum + point.x * next.y - next.x * point.y;
 }, 0)) / 2;

 return areaSquareMeters / 10_000;
};

export const PolygonMap: React.FC<PolygonMapProps> = ({ waypoints, className = '', isFlagged = false, language = 'EN' }) => {
 const copy = POLYGON_MAP_COPY[language as PolygonMapLanguage];
 // Compute SVG viewBox and coordinate mappings
 const mapData = useMemo(() => {
 if (!waypoints || waypoints.length === 0) {
 return null;
 }

 let minLat = Infinity;
 let maxLat = -Infinity;
 let minLng = Infinity;
 let maxLng = -Infinity;

 waypoints.forEach((p) => {
 if (p.lat < minLat) minLat = p.lat;
 if (p.lat > maxLat) maxLat = p.lat;
 if (p.lng < minLng) minLng = p.lng;
 if (p.lng > maxLng) maxLng = p.lng;
 });

 // Add some padding to the bounds
 const latDiff = maxLat - minLat || 0.001;
 const lngDiff = maxLng - minLng || 0.001;

 const padLat = latDiff * 0.15;
 const padLng = lngDiff * 0.15;

 const bounds = {
 minLat: minLat - padLat,
 maxLat: maxLat + padLat,
 minLng: minLng - padLng,
 maxLng: maxLng + padLng,
 };

 const width = 400;
 const height = 280;

 const getX = (lng: number) => {
 const span = bounds.maxLng - bounds.minLng;
 return ((lng - bounds.minLng) / span) * width;
 };

 const getY = (lat: number) => {
 const span = bounds.maxLat - bounds.minLat;
 // In SVG, y goes down, so flip it
 return height - ((lat - bounds.minLat) / span) * height;
 };

 const mappedPoints = waypoints.map((p, idx) => ({
 x: getX(p.lng),
 y: getY(p.lat),
 lat: p.lat,
 lng: p.lng,
 idx: idx + 1,
 activity: p.activity,
 timestamp: p.timestamp,
 }));

 // Generate path for the polygon hull (sorted by angle to look neat, or just ordered)
 // To keep it simple and beautiful, let's sort points radially from the center so they form a nice closed loop
 const center = mappedPoints.reduce(
 (acc, p) => ({ x: acc.x + p.x / mappedPoints.length, y: acc.y + p.y / mappedPoints.length }),
 { x: 0, y: 0 }
 );

 const sortedForHull = [...mappedPoints].sort((a, b) => {
 const angleA = Math.atan2(a.y - center.y, a.x - center.x);
 const angleB = Math.atan2(b.y - center.y, b.x - center.x);
 return angleA - angleB;
 });

 const hullPointsStr = sortedForHull.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
 const computedAreaHa = computeAreaHectares(sortedForHull);

 return {
 width,
 height,
 mappedPoints,
 sortedForHull,
 hullPointsStr,
 computedAreaHa,
 };
 }, [waypoints]);

 if (!mapData) {
 return (
 <div className={`flex items-center justify-center bg-slate-50 border border-dashed border-slate-300 rounded-lg text-slate-400 text-sm ${className}`}>
 {copy.noGps}
 </div>
 );
 }

 const { width, height, mappedPoints, sortedForHull, hullPointsStr, computedAreaHa } = mapData;

 return (
 <div className={`relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-3 shadow-inner ${className}`} id="polygon-map-container">
 {/* Grid line overlays for a "tech/satellite map" vibe */}
 <div className="absolute inset-0 pointer-events-none opacity-5 grid grid-cols-6 grid-rows-6">
 {Array.from({ length: 36 }).map((_, i) => (
 <div key={i} className="border-[0.5px] border-emerald-400" />
 ))}
 </div>

 <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
 <span className="text-xs text-slate-400 ">{copy.accumulator}</span>
 <div className="flex items-center gap-1.5 bg-slate-950/80 backdrop-blur border border-slate-800 px-2 py-0.5 rounded-full">
 <div className={`w-2 h-2 rounded-full ${isFlagged ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`} />
 <span className="text-xs font-medium text-slate-200">
 {copy.waypointsCollected(waypoints.length)}
 </span>
 </div>
 </div>

 <div className="absolute top-3 right-3 z-10">
 <span className="text-xs bg-slate-950/85 backdrop-blur border border-slate-800 text-emerald-400 px-2 py-1 rounded-md">
 {copy.gpsAccuracy}
 </span>
 </div>

 {/* Main SVG drawing of boundaries */}
 <svg
 viewBox={`0 0 ${width} ${height}`}
 className="w-full h-full select-none"
 id="polygon-svg"
 >
 {/* Draw the filled area representing the land polygon */}
 {sortedForHull.length >= 3 && (
 <polygon
 points={hullPointsStr}
 className={`transition-colors duration-300 ${
 isFlagged
 ? 'fill-amber-500/10 stroke-amber-500/50 stroke-2 stroke-dasharray-[4]'
 : 'fill-emerald-500/15 stroke-emerald-500/40 stroke-2'
 }`}
 />
 )}

 {/* Draw connectors or lines in sequence */}
 {mappedPoints.map((p, i) => {
 if (i === 0) return null;
 const prev = mappedPoints[i - 1];
 return (
 <line
 key={`line-${i}`}
 x1={prev.x}
 y1={prev.y}
 x2={p.x}
 y2={p.y}
 className="stroke-slate-500/25 stroke-1"
 />
 );
 })}

 {/* Draw waypoints as interactive circles */}
 {mappedPoints.map((p) => {
 // Highlight a few points for visual aesthetics
 const isKeyPoint = p.idx % 5 === 1;
 return (
 <g key={`point-${p.idx}`} className="group/dot cursor-pointer">
 <circle
 cx={p.x}
 cy={p.y}
 r={isKeyPoint ? 5 : 3.5}
 className={`transition-all duration-200 ${
 isFlagged
 ? 'fill-amber-400 stroke-amber-950 group-hover/dot:r-6'
 : 'fill-emerald-400 stroke-emerald-950 group-hover/dot:r-6'
 } stroke-2`}
 />
 <title>{`WP #${p.idx}: Lat ${p.lat.toFixed(5)}, Lng ${p.lng.toFixed(5)} ${p.activity ? `(${p.activity})` : ''}`}</title>
 </g>
 );
 })}
 </svg>

 <div className="absolute bottom-3 left-3 right-3 z-10 flex justify-between items-center bg-slate-950/80 backdrop-blur border border-slate-800/60 px-2.5 py-1.5 rounded-lg">
 <div className="flex flex-col">
 <span className="text-xs text-slate-500 ">{copy.coverageCenter}</span>
 <span className="text-xs font-semibold text-slate-300">
 {waypoints[0]?.lat.toFixed(4)} deg N, {waypoints[0]?.lng.toFixed(4)} deg E
 </span>
 </div>
 <div className="flex flex-col text-right">
 <span className="text-xs text-slate-500 ">{copy.computedArea}</span>
 <span className="text-xs font-semibold text-emerald-400">
 {computedAreaHa.toFixed(1)} ha
 </span>
 </div>
 </div>
 </div>
 );
};
