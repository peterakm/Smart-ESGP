import type { Farmer } from '../types';

export const getStableCertificateId = (farmer: Pick<Farmer, 'id' | 'mpobLicence'>) => {
 const source = farmer.mpobLicence || farmer.id;
 let hash = 0;

 for (let i = 0; i < source.length; i += 1) {
 hash = (hash * 31 + source.charCodeAt(i)) % 100000;
 }

 return `MS-JHR-${hash.toString().padStart(5, '0')}`;
};
