import logo from './champion-coders-logo.png';

// The club's logo (M8), on a white tile so it reads on the dark blue sidebar and in the dark theme. A static
// import: the file is served from /_next/static with the rest of the build.
export function ClubLogo() {
  return (
    <span className="club-logo">
      <img src={logo.src} width={logo.width} height={logo.height} alt="Champion Coders" />
    </span>
  );
}
