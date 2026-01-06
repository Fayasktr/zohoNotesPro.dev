try {
    console.log('Attempting to load AntigravityEngine...');
    const engine = require('./engine/AntigravityEngine');
    console.log('Engine loaded successfully.');

    console.log('Attempting to load app.js...');
    require('./app.js');
} catch (err) {
    console.error('CATCHED ERROR:');
    console.error(err);
}
