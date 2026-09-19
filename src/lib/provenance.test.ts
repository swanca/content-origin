import { describe, it, expect } from 'vitest';
import { interpret, SOURCE_TYPES, type ManifestStoreLike } from './provenance';

const AI = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';
const CAMERA = 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture';
const COMPOSITE_AI = 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia';

/** Builds a manifest store shaped like the one the SDK returns. */
function store(options: {
  actions?: Array<Record<string, unknown>>;
  generator?: string;
  issuer?: string;
  status?: Array<{ code: string; explanation?: string }>;
  assertions?: Array<{ label: string; data: unknown }>;
  ingredients?: Array<Record<string, unknown>>;
}): ManifestStoreLike {
  const assertions = [...(options.assertions ?? [])];
  if (options.actions) assertions.push({ label: 'c2pa.actions.v2', data: { actions: options.actions } });

  return {
    active_manifest: 'urn:active',
    manifests: {
      'urn:active': {
        title: 'photo.jpg',
        claim_generator_info: [{ name: options.generator ?? 'Test Generator', version: '1.0' }],
        signature_info: { issuer: options.issuer ?? 'Example CA', time: '2026-03-01T10:00:00Z', alg: 'Es256' },
        assertions,
        ingredients: options.ingredients ?? [],
      },
    },
    validation_status: options.status ?? [],
  };
}

describe('no credentials at all', () => {
  const reading = interpret(null);

  it('reports that nothing was found', () => {
    expect(reading.verdict).toBe('none');
  });

  // The single most important behaviour in this file. Most images on the
  // internet carry no credentials, and an absence is not evidence of anything.
  // A tool that implied otherwise would be worse than no tool.
  it('states plainly that this proves nothing either way', () => {
    expect(reading.explanation).toMatch(/does not mean|proves nothing|no conclusion/i);
  });

  it('claims no confidence', () => {
    expect(reading.confidence).toBe('unknown');
  });

  it('never claims the image is or is not AI', () => {
    expect(reading.headline).not.toMatch(/\bis AI\b|\bnot AI\b|authentic|genuine/i);
  });
});

describe('AI generated images', () => {
  const reading = interpret(
    store({
      generator: 'OpenAI DALL-E',
      actions: [{ action: 'c2pa.created', digitalSourceType: AI, softwareAgent: 'DALL-E 3' }],
    }),
  );

  it('recognises the trained algorithmic media source type', () => {
    expect(reading.verdict).toBe('ai-generated');
  });

  it('attributes the claim rather than asserting it as fact', () => {
    expect(reading.confidence).toBe('claimed');
    expect(reading.explanation).toMatch(/signed|declar|claim/i);
  });

  it('names who signed the claim', () => {
    expect(reading.signer?.issuer).toBe('Example CA');
  });

  it('names the software that made it', () => {
    expect(reading.producer).toMatch(/DALL-E/);
  });
});

describe('partly AI images', () => {
  it('separates a composite containing AI from a fully generated one', () => {
    const reading = interpret(store({ actions: [{ action: 'c2pa.created', digitalSourceType: COMPOSITE_AI }] }));
    expect(reading.verdict).toBe('ai-assisted');
  });
});

describe('camera captures', () => {
  const reading = interpret(
    store({
      generator: 'Leica M11-P',
      actions: [{ action: 'c2pa.created', digitalSourceType: CAMERA, softwareAgent: 'Leica M11-P' }],
    }),
  );

  it('recognises a digital capture', () => {
    expect(reading.verdict).toBe('camera');
  });

  it('still only reports it as a signed claim', () => {
    expect(reading.confidence).toBe('claimed');
  });
});

describe('edited images', () => {
  it('reports edits when there is no creation source type', () => {
    const reading = interpret(
      store({
        generator: 'Adobe Photoshop',
        actions: [
          { action: 'c2pa.opened' },
          { action: 'c2pa.color_adjustments', softwareAgent: 'Adobe Photoshop' },
          { action: 'c2pa.cropped' },
        ],
      }),
    );
    expect(reading.verdict).toBe('edited');
    expect(reading.steps.length).toBe(3);
  });

  it('flags AI edits applied to a camera original', () => {
    const reading = interpret(
      store({
        actions: [
          { action: 'c2pa.created', digitalSourceType: CAMERA },
          { action: 'c2pa.edited', digitalSourceType: COMPOSITE_AI, softwareAgent: 'Generative Fill' },
        ],
      }),
    );
    expect(reading.verdict).toBe('ai-assisted');
  });
});

describe('validation failures', () => {
  it('reports a broken signature as tampering, overriding everything else', () => {
    const reading = interpret(
      store({
        actions: [{ action: 'c2pa.created', digitalSourceType: CAMERA }],
        status: [{ code: 'assertion.dataHash.mismatch', explanation: 'data hash does not match' }],
      }),
    );
    expect(reading.verdict).toBe('tampered');
    expect(reading.confidence).toBe('proven');
  });

  it('does not treat an informational status as a failure', () => {
    const reading = interpret(
      store({
        actions: [{ action: 'c2pa.created', digitalSourceType: CAMERA }],
        status: [{ code: 'claimSignature.validated' }],
      }),
    );
    expect(reading.verdict).toBe('camera');
  });
});

describe('credentials with nothing conclusive', () => {
  it('says credentials exist but describe no origin', () => {
    const reading = interpret(store({ actions: [] }));
    expect(reading.verdict).toBe('signed');
  });
});

describe('the edit timeline', () => {
  it('lists each step in order with readable labels', () => {
    const reading = interpret(
      store({
        actions: [
          { action: 'c2pa.created', digitalSourceType: CAMERA },
          { action: 'c2pa.cropped' },
          { action: 'c2pa.color_adjustments' },
        ],
      }),
    );
    expect(reading.steps.map((s) => s.label)).toEqual(['Created', 'Cropped', 'Colour adjusted']);
  });

  it('falls back to the raw action name for anything unrecognised', () => {
    const reading = interpret(store({ actions: [{ action: 'com.example.custom' }] }));
    expect(reading.steps[0]!.label).toBe('com.example.custom');
  });

  it('records the software for each step where it is given', () => {
    const reading = interpret(store({ actions: [{ action: 'c2pa.cropped', softwareAgent: 'Photoshop 26' }] }));
    expect(reading.steps[0]!.software).toBe('Photoshop 26');
  });

  it('accepts a software agent given as an object rather than a string', () => {
    const reading = interpret(
      store({ actions: [{ action: 'c2pa.cropped', softwareAgent: { name: 'Lightroom', version: '14' } }] }),
    );
    expect(reading.steps[0]!.software).toMatch(/Lightroom/);
  });
});

describe('AI training permission', () => {
  it('reports when the creator forbade training on the image', () => {
    const reading = interpret(
      store({
        actions: [{ action: 'c2pa.created', digitalSourceType: CAMERA }],
        assertions: [{ label: 'c2pa.training-mining', data: { entries: { 'c2pa.ai_training': { use: 'notAllowed' } } } }],
      }),
    );
    expect(reading.aiTraining).toBe('not-allowed');
  });

  it('says nothing when the assertion is absent', () => {
    const reading = interpret(store({ actions: [] }));
    expect(reading.aiTraining).toBe('unstated');
  });
});

describe('ingredients', () => {
  it('lists the source images a composite was built from', () => {
    const reading = interpret(
      store({ actions: [], ingredients: [{ title: 'background.jpg' }, { title: 'subject.png' }] }),
    );
    expect(reading.ingredients).toEqual(['background.jpg', 'subject.png']);
  });
});

describe('source type vocabulary', () => {
  it('gives every known source type a plain language description', () => {
    for (const [uri, entry] of Object.entries(SOURCE_TYPES)) {
      expect(entry.label.length, uri).toBeGreaterThan(2);
      expect(entry.label).not.toMatch(/http|digitalsourcetype/);
    }
  });
});

describe('an unrecognised certificate is not tampering', () => {
  // Found by running a real signed sample through the tool. The C2PA test
  // certificate is not on the trust list, but the file is untouched and the
  // signature verifies. Calling that "tampered" accuses someone of altering a
  // file they did not alter.
  const reading = interpret(
    store({
      actions: [{ action: 'c2pa.created', digitalSourceType: CAMERA }],
      status: [{ code: 'signingCredential.untrusted', explanation: 'signing certificate untrusted' }],
    }),
  );

  it('keeps the verdict the manifest supports', () => {
    expect(reading.verdict).toBe('camera');
    expect(reading.verdict).not.toBe('tampered');
  });

  it('records the signer as unrecognised', () => {
    expect(reading.signerTrust).toBe('unrecognised');
  });

  it('warns about the signer without claiming the file changed', () => {
    const warning = reading.warnings.join(' ');
    expect(warning).toMatch(/not on the known trust list|cannot confirm who/i);
    expect(warning).toMatch(/intact|unaltered/i);
  });

  it('still flags a genuine hash mismatch as tampering', () => {
    const tampered = interpret(
      store({
        actions: [{ action: 'c2pa.created', digitalSourceType: CAMERA }],
        status: [{ code: 'assertion.dataHash.mismatch' }, { code: 'signingCredential.untrusted' }],
      }),
    );
    expect(tampered.verdict).toBe('tampered');
  });

  it('marks an expired certificate separately from an unknown one', () => {
    const expired = interpret(
      store({ actions: [], status: [{ code: 'signingCredential.expired' }] }),
    );
    expect(expired.signerTrust).toBe('expired');
    expect(expired.verdict).not.toBe('tampered');
  });

  it('marks a revoked certificate and says to be suspicious', () => {
    const revoked = interpret(
      store({ actions: [], status: [{ code: 'signingCredential.revoked' }] }),
    );
    expect(revoked.signerTrust).toBe('revoked');
    expect(revoked.warnings.join(' ')).toMatch(/revoked/i);
  });

  it('reports a clean file as trusted', () => {
    const clean = interpret(store({ actions: [{ action: 'c2pa.created', digitalSourceType: CAMERA }] }));
    expect(clean.signerTrust).toBe('trusted');
    expect(clean.warnings).toEqual([]);
  });
});
