async function test() {
  const r = await fetch('https://api.openalex.org/sources/S133202952');
  const text = await r.text();
  console.log('STATUS:', r.status);
  console.log('FIRST 500 CHARS:', text.slice(0, 500));
}
test();