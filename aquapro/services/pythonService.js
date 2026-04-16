// services/pythonService.js
// Runs p1.py with waterParameters and returns the prediction JSON.
// Uses Node.js child_process to call Python.

const { spawn } = require('child_process');
const path = require('path');

/**
 * Call p1.py with waterParameters
 * @param {Object} waterParameters  - { dissolvedOxygen, ph, temperature, ammonia, turbidity }
 * @param {String} projectTitle     - pond name / title
 * @param {Number} testNumber       - test number
 * @returns {Promise<Object>}       - prediction document from p1.py
 */
const runPrediction = (waterParameters, projectTitle = 'AquaPro Test', testNumber = 1) => {
  return new Promise((resolve, reject) => {

    // Path to p1_wrapper.py (sits next to p1.py in project root)
    // p1_wrapper.py reads stdin JSON → imports p1.py → prints result JSON
    const scriptPath = path.join(__dirname, '..', 'p1_wrapper.py');

    // We pass all inputs as a JSON string via stdin to p1.py
    // p1.py will be updated to read from stdin (see README)
    const inputPayload = JSON.stringify({
      waterParameters,
      projectTitle,
      testNumber,
    });

    const python = spawn('python3', [scriptPath]);

    let output = '';
    let errOutput = '';

    // Send input to p1.py via stdin
    python.stdin.write(inputPayload);
    python.stdin.end();

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errOutput += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('❌ Python error:', errOutput);
        return reject(new Error(`p1.py exited with code ${code}: ${errOutput}`));
      }

      try {
        // p1.py prints the result JSON on the last line
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const result = JSON.parse(lastLine);
        resolve(result);
      } catch (e) {
        console.error('❌ JSON parse error from p1.py output:', output);
        reject(new Error('Could not parse p1.py output as JSON'));
      }
    });
  });
};

module.exports = { runPrediction };
