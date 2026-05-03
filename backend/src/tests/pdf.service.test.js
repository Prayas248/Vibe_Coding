import { jest } from '@jest/globals';

const mockGetPage = jest.fn();
const mockGetDocument = {
  promise: Promise.resolve({
    numPages: 1,
    getPage: mockGetPage
  })
};

jest.unstable_mockModule('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: jest.fn(() => mockGetDocument)
}));

// Use dynamic import so the mock takes effect
const { PdfService } = await import('../services/pdf.service.js');

describe('PdfService Abstract Extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockGetPage.mockResolvedValue({
      getTextContent: jest.fn().mockResolvedValue({ items: [] }),
      getViewport: jest.fn().mockReturnValue({ width: 800 })
    });
  });

  it('extracts structured abstract correctly using standard boundaries', async () => {
    jest.spyOn(PdfService, 'basicParse').mockResolvedValue(`
        Some Paper Title
        Authors Names
        Abstract— This is the core abstract text we want to extract. It has multiple sentences. It is long enough to pass the length check that prevents garbage extraction. We just need to add a bit more text here to ensure it crosses the one hundred character limit comfortably.
        1. Introduction
        This is the introduction section.
    `);

    const { abstract, source } = await PdfService.extractAbstract(Buffer.from('dummy'));
    expect(abstract).toBe('This is the core abstract text we want to extract. It has multiple sentences. It is long enough to pass the length check that prevents garbage extraction. We just need to add a bit more text here to ensure it crosses the one hundred character limit comfortably.');
    expect(source).toBe('abstract');
  });

  it('handles "Keywords" as an end boundary', async () => {
    jest.spyOn(PdfService, 'basicParse').mockResolvedValue(`
        Title
        ABSTRACT
        This is an abstract followed by keywords. It also needs to be sufficiently long so that the system recognizes it as a valid abstract block instead of noise. We are adding extra sentences here for length.
        Keywords: machine learning, AI
        1. Introduction
    `);

    const { abstract, source } = await PdfService.extractAbstract(Buffer.from('dummy'));
    expect(abstract).toBe('This is an abstract followed by keywords. It also needs to be sufficiently long so that the system recognizes it as a valid abstract block instead of noise. We are adding extra sentences here for length.');
    expect(source).toBe('abstract');
  });

  it('falls back to layout-aware if basic yields null and no abstract marker', async () => {
    // Basic parser returns text without "abstract" keyword at all
    jest.spyOn(PdfService, 'basicParse').mockResolvedValue('Short garbage text.');

    // Layout-aware parser successfully re-assembles the correct string
    mockGetPage.mockResolvedValue({
      getTextContent: jest.fn().mockResolvedValue({
        items: [
          { str: 'Abstract.', transform: [1, 0, 0, 1, 100, 800] },
          { str: 'This is the correctly extracted layout-aware text. It must be sufficiently long to pass the length threshold, so we are adding lots of text to it so that it registers as a legitimate abstract.', transform: [1, 0, 0, 1, 100, 780] },
          { str: 'Introduction', transform: [1, 0, 0, 1, 100, 760] }
        ]
      }),
      getViewport: jest.fn().mockReturnValue({ width: 800 })
    });

    const { abstract, source } = await PdfService.extractAbstract(Buffer.from('dummy'));
    expect(source).toBe('layout-aware');
    expect(abstract).toBe('This is the correctly extracted layout-aware text. It must be sufficiently long to pass the length threshold, so we are adding lots of text to it so that it registers as a legitimate abstract.');
  });

  it('does NOT trigger layout-aware when abstract marker exists even with fallback', async () => {
    // Text contains "abstract" but only short junk after it, then lots of non-abstract text
    // The regex matches "abstract" + grabs a long trailing blob → still "abstract" source
    // The key test: layout-aware should NOT be invoked because the marker exists
    const longText = 'Some title. Abstract ' + 'A'.repeat(600) + ' more text ' + 'B'.repeat(600);
    jest.spyOn(PdfService, 'basicParse').mockResolvedValue(longText);
    const layoutSpy = jest.spyOn(PdfService, 'extractTextLayoutAware');

    await PdfService.extractAbstract(Buffer.from('dummy'));
    // Layout-aware should never have been called because "abstract" is in the basic text
    expect(layoutSpy).not.toHaveBeenCalled();
  });

  it('normalizes excessive whitespace', async () => {
    jest.spyOn(PdfService, 'basicParse').mockResolvedValue(`
        Abstract.  This   has 
        weird \u00A0 whitespace. We must make this text block long enough to be considered valid by the extraction length checker, otherwise it will fail as garbage.
        I. Introduction
    `);

    const { abstract, source } = await PdfService.extractAbstract(Buffer.from('dummy'));
    expect(abstract).toBe('This has weird whitespace. We must make this text block long enough to be considered valid by the extraction length checker, otherwise it will fail as garbage.');
    expect(source).toBe('abstract');
  });

  it('throws an error if all extraction paths yield garbage', async () => {
    jest.spyOn(PdfService, 'basicParse').mockResolvedValue('Too short.');

    await expect(PdfService.extractAbstract(Buffer.from('dummy'))).rejects.toThrow(/Could not confidently extract/);
  });
});
