const url = "https://script.google.com/macros/s/AKfycbz0wbsjiHrm2LPACR_r91hoJAqZruao04fEVGBsXUXcXVyUXG9QzSsIjj_Cgk2O9k7u/exec";
fetch(url, {
    method: 'POST',
    body: JSON.stringify({action: 'loadInitialData', data: {}}),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
}).then(r => r.text()).then(t => console.log(t)).catch(console.error);
