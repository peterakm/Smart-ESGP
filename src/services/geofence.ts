import type { EvidenceLocationValidation, Waypoint } from '../types';

interface Coordinate {
 lat: number;
 lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

const isFiniteCoordinate = (value: Coordinate | undefined): value is Coordinate => {
 return !!value
 && Number.isFinite(value.lat)
 && Number.isFinite(value.lng)
 && Math.abs(value.lat) <= 90
 && Math.abs(value.lng) <= 180;
};

const toRadians = (degrees: number) => degrees * Math.PI / 180;

const distanceMeters = (a: Coordinate, b: Coordinate) => {
 const lat1 = toRadians(a.lat);
 const lat2 = toRadians(b.lat);
 const deltaLat = toRadians(b.lat - a.lat);
 const deltaLng = toRadians(b.lng - a.lng);

 const haversine = Math.sin(deltaLat / 2) ** 2
 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

 return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
};

const projectToMeters = (point: Coordinate, origin: Coordinate) => {
 const latMeters = distanceMeters(origin, { lat: point.lat, lng: origin.lng }) * (point.lat >= origin.lat ? 1 : -1);
 const lngMeters = distanceMeters(origin, { lat: origin.lat, lng: point.lng }) * (point.lng >= origin.lng ? 1 : -1);

 return { x: lngMeters, y: latMeters };
};

const distanceToSegmentMeters = (point: Coordinate, start: Coordinate, end: Coordinate) => {
 const p = projectToMeters(point, point);
 const a = projectToMeters(start, point);
 const b = projectToMeters(end, point);
 const dx = b.x - a.x;
 const dy = b.y - a.y;

 if (dx === 0 && dy === 0) {
 return Math.hypot(p.x - a.x, p.y - a.y);
 }

 const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
 const closest = { x: a.x + t * dx, y: a.y + t * dy };

 return Math.hypot(p.x - closest.x, p.y - closest.y);
};

const isPointInsidePolygon = (point: Coordinate, polygon: Coordinate[]) => {
 let inside = false;

 for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
 const current = polygon[index];
 const previous = polygon[previousIndex];
 const intersects = ((current.lat > point.lat) !== (previous.lat > point.lat))
 && point.lng < ((previous.lng - current.lng) * (point.lat - current.lat)) / (previous.lat - current.lat) + current.lng;

 if (intersects) {
 inside = !inside;
 }
 }

 return inside;
};

const distanceToPolygonMeters = (point: Coordinate, polygon: Coordinate[]) => {
 return polygon.reduce((closest, start, index) => {
 const end = polygon[(index + 1) % polygon.length];
 return Math.min(closest, distanceToSegmentMeters(point, start, end));
 }, Number.POSITIVE_INFINITY);
};

export const evaluateEvidenceLocation = (
 location: Coordinate | undefined,
 polygonWaypoints: Waypoint[],
 checkedAt = new Date().toISOString()
): EvidenceLocationValidation => {
 if (!isFiniteCoordinate(location)) {
 return {
 status: 'missing_location',
 checkedAt,
 reason: 'No valid WhatsApp GPS coordinate was provided.',
 };
 }

 const polygon = polygonWaypoints
 .map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng }))
 .filter(isFiniteCoordinate);

 if (polygon.length < 3) {
 return {
 status: 'unknown_plot',
 checkedAt,
 reason: 'Farmer plot has fewer than three valid polygon coordinates.',
 };
 }

 const distance = Math.round(distanceToPolygonMeters(location, polygon));

 if (isPointInsidePolygon(location, polygon)) {
 return {
 status: 'inside_plot',
 checkedAt,
 distanceMeters: distance,
 };
 }

 return {
 status: 'outside_plot',
 checkedAt,
 distanceMeters: distance,
 reason: `WhatsApp GPS point is approximately ${distance} meter(s) outside the registered plot boundary.`,
 };
};
