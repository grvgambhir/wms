/// <reference types="jest" />
import { judoEvidenceDeclaration } from './ordinaryEvidence';

describe('judoEvidenceDeclaration', () => {
  it('turns each supported ordinary-evidence input into its explicit declared fact', () => {
    expect(judoEvidenceDeclaration('weigh_in', '80.4')).toEqual({ attribute: 'weight_kg', numericValue: 80.4 });
    expect(judoEvidenceDeclaration('belt_certificate', '2dan')).toEqual({ attribute: 'belt_rank', textValue: '2dan' });
    expect(judoEvidenceDeclaration('federation_licence', '2028-01-01')).toEqual({
      attribute: 'federation_licence',
      textValue: 'active',
      validUntil: '2028-01-01',
    });
  });

  it('does not send malformed numeric or date values to the backend', () => {
    expect(judoEvidenceDeclaration('weigh_in', 'eighty')).toBeUndefined();
    expect(judoEvidenceDeclaration('federation_licence', '2027-02-30')).toBeUndefined();
  });
});
