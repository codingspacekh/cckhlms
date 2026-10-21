// The certificate PDF (FR-ADM-11), drawn on demand. Version 1 is the placeholder layout from the P0 prototype,
// used until the club's own design arrives; that design becomes version 2, and certificates already issued keep
// the version they were issued with.
import path from 'node:path';
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { formatCode, verifyUrl } from './rules';

// Names in any script must print correctly (NFR-09); the PDF's built-in Helvetica has only basic Latin letters.
// Noto Sans (OFL) in subsets, tried in order for each letter: Latin, Latin Extended, Vietnamese, then Khmer. The
// files are copied into the standalone build by outputFileTracingIncludes in next.config.ts.
export const FONT_FILES = ['latin', 'latin-ext', 'vietnamese'].flatMap((sub) =>
  [400, 700].map((w) => `node_modules/@fontsource/noto-sans/files/noto-sans-${sub}-${w}-normal.woff`),
);
FONT_FILES.push(...[400, 700].map((w) => `node_modules/@fontsource/noto-sans-khmer/files/noto-sans-khmer-khmer-${w}-normal.woff`));
const SUBSETS = ['latin', 'latin-ext', 'vietnamese', 'khmer'];
for (const sub of SUBSETS)
  Font.register({
    family: `Noto ${sub}`,
    fonts: [400, 700].map((fontWeight) => ({
      src: path.join(
        process.cwd(),
        FONT_FILES.find((f) => f.includes(`-${sub}-${fontWeight}-`))!,
      ),
      fontWeight,
    })),
  });
Font.registerHyphenationCallback((word) => [word]); // never split a name across lines
const text = SUBSETS.map((sub) => `Noto ${sub}`);

export const CURRENT_TEMPLATE = 1;

export type CertificateContent = {
  clubName: string;
  studentName: string;
  courseName: string;
  termName: string;
  issuedOn: string; // e.g. "4 Apr 2027"
  signer: string;
  code: string;
  origin: string; // the LMS origin, for the verify link
};

const ink = '#111827';
const muted = '#4b5563';
const accent = '#1d4ed8';
const s = StyleSheet.create({
  page: { padding: 36, fontFamily: text, color: ink },
  frame: { flex: 1, borderWidth: 2, borderColor: accent, padding: 40, alignItems: 'center', justifyContent: 'space-between' },
  club: { fontSize: 11, letterSpacing: 3, color: muted, textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: 700, marginTop: 14 },
  lead: { fontSize: 13, color: muted, marginTop: 34 },
  name: { fontSize: 34, fontWeight: 700, marginTop: 10 },
  course: { fontSize: 15, marginTop: 14 },
  footer: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  signLine: { width: 220, borderTopWidth: 1, borderColor: ink, paddingTop: 6, fontSize: 11 },
  small: { fontSize: 9, color: muted, marginTop: 3 },
  verify: { flexDirection: 'row', alignItems: 'flex-end' },
  qr: { width: 84, height: 84, marginLeft: 12 },
  verifyText: { fontSize: 9, color: muted, textAlign: 'right' },
  code: { fontSize: 10, fontFamily: 'Courier', color: ink, textAlign: 'right', marginTop: 3 },
});

function Version1({ c, qr }: { c: CertificateContent; qr: string }) {
  const url = verifyUrl(c.origin, c.code);
  return (
    <Document title={`Certificate · ${c.studentName} · ${c.courseName}`} author={c.clubName}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.club}>{c.clubName}</Text>
            <Text style={s.title}>Certificate of completion</Text>
            <Text style={s.lead}>This certifies that</Text>
            <Text style={s.name}>{c.studentName}</Text>
            <Text style={s.course}>
              has completed {c.courseName} · {c.termName}
            </Text>
          </View>
          <View style={s.footer}>
            <View>
              <Text style={s.signLine}>{c.signer}</Text>
              <Text style={s.small}>Issued {c.issuedOn}</Text>
            </View>
            <View style={s.verify}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.verifyText}>Check this certificate at</Text>
                <Text style={s.verifyText}>{url.replace(/^https?:\/\//, '')}</Text>
                <Text style={s.code}>{formatCode(c.code)}</Text>
              </View>
              <Image style={s.qr} src={qr} />
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificate(version: number, c: CertificateContent): Promise<Uint8Array> {
  if (version !== 1) throw new Error(`Unknown certificate template version ${version}`);
  const qr = await QRCode.toDataURL(verifyUrl(c.origin, c.code), { errorCorrectionLevel: 'M', margin: 0, width: 336 });
  return new Uint8Array(await renderToBuffer(<Version1 c={c} qr={qr} />));
}
