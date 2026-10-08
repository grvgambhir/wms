import type { PaginatedResponse } from '@/domain/models/api';
import type { SportRule } from '@/domain/models/rule';

/** Offline mock snapshot of the demo seed. Live eligibility does not read this. */
export const DEMO_SPORT_RULES: PaginatedResponse<SportRule> = {
  items: [
    {
      id: 'eb754330-18ac-4a72-83f1-202700000001',
      sport: 'Tennis',
      event: "Men's Doubles",
      strategy: 'youngest-member',
      referenceDate: '2027-12-31',
      version: 'v2.1',
      effectiveDate: '2026-09-01T00:00:00.000Z',
      status: 'active',
      bands: [
        { id: 'eb754330-18ac-4a72-83f1-202700000011', name: "Men's Doubles 30–34", minAge: 30, maxAge: 34 },
        { id: 'eb754330-18ac-4a72-83f1-202700000012', name: "Men's Doubles 35–39", minAge: 35, maxAge: 39 },
        { id: 'eb754330-18ac-4a72-83f1-202700000013', name: "Men's Doubles 40–44", minAge: 40, maxAge: 44 },
        { id: 'eb754330-18ac-4a72-83f1-202700000014', name: "Men's Doubles 45+", minAge: 45, maxAge: null },
      ],
    },
    {
      id: 'eb754330-18ac-4a72-83f1-202700000002',
      sport: 'Basketball',
      event: "Men's Team",
      strategy: 'youngest-member',
      referenceDate: '2027-12-31',
      version: 'v2.1',
      effectiveDate: '2026-09-01T00:00:00.000Z',
      status: 'active',
      bands: [
        { id: 'eb754330-18ac-4a72-83f1-202700000021', name: "Men's Team 30–34", minAge: 30, maxAge: 34 },
        { id: 'eb754330-18ac-4a72-83f1-202700000022', name: "Men's Team 35–39", minAge: 35, maxAge: 39 },
        { id: 'eb754330-18ac-4a72-83f1-202700000023', name: "Men's Team 40–49", minAge: 40, maxAge: 49 },
        { id: 'eb754330-18ac-4a72-83f1-202700000024', name: "Men's Team 50+", minAge: 50, maxAge: null },
      ],
    },
    {
      id: 'eb754330-18ac-4a72-83f1-202700000003',
      sport: 'Rowing',
      event: 'Coxed Four',
      strategy: 'crew-average',
      excludeRoles: ['coxswain'],
      rounding: 'floor',
      referenceDate: '2027-12-31',
      version: 'v2.1',
      effectiveDate: '2026-09-01T00:00:00.000Z',
      status: 'active',
      bands: [
        { id: 'eb754330-18ac-4a72-83f1-202700000031', name: 'Category A (27–35)', minAge: 27, maxAge: 35 },
        { id: 'eb754330-18ac-4a72-83f1-202700000032', name: 'Category B (36–42)', minAge: 36, maxAge: 42 },
        { id: 'eb754330-18ac-4a72-83f1-202700000033', name: 'Category C (43+)', minAge: 43, maxAge: null },
      ],
    },
    {
      id: 'eb754330-18ac-4a72-83f1-202700000004',
      sport: 'Swimming',
      event: '100m Freestyle',
      strategy: 'individual',
      referenceDate: '2027-12-31',
      version: 'v2.1',
      effectiveDate: '2026-09-01T00:00:00.000Z',
      status: 'active',
      bands: [
        { id: 'eb754330-18ac-4a72-83f1-202700000041', name: '40–44', minAge: 40, maxAge: 44 },
        { id: 'eb754330-18ac-4a72-83f1-202700000042', name: '45–49', minAge: 45, maxAge: 49 },
        { id: 'eb754330-18ac-4a72-83f1-202700000043', name: '50+', minAge: 50, maxAge: null },
      ],
    },
    {
      id: 'eb754330-18ac-4a72-83f1-202700000005',
      sport: 'Para Swimming',
      event: '100m Freestyle',
      strategy: 'individual',
      referenceDate: '2027-12-31',
      version: 'v2.1',
      effectiveDate: '2026-09-01T00:00:00.000Z',
      status: 'active',
      bands: [
        { id: 'eb754330-18ac-4a72-83f1-202700000051', name: '40–44', minAge: 40, maxAge: 44 },
        { id: 'eb754330-18ac-4a72-83f1-202700000052', name: '45–49', minAge: 45, maxAge: 49 },
        { id: 'eb754330-18ac-4a72-83f1-202700000053', name: '50+', minAge: 50, maxAge: null },
      ],
    },
  ],
  total: 5,
};
