const madge = require('madge');
const fs = require('fs');
const path = require('path');

function extractPackageName(filePath) {
    const normalized = filePath.replace(/\\/g, "/");

    // Find "src/main/js" or "src/test/js"
    const match = normalized.match(/src\/(main|test)\/js\/(.+)\.js$/);
    if (match) {
        const type = match[1]; // main or test
        const packagePath = match[2].replace(/\//g, "."); // convert slashes to dots
        return `${type}.js.${packagePath}`;
    }

    //remove .js and replace / with .
    return normalized.replace(/\.js$/, "").replace(/\//g, ".");
}

function convertDependencyGraph(dependencyGraph) {
  const nodes = [];
  const links = [];
  const idMap = {}; // map file → id
  let idCounter = 0;

  Object.keys(dependencyGraph).forEach(file => {
    if (!(file in idMap)) {
      idMap[file] = idCounter++;
      nodes.push({
        id: idMap[file],
        name: file,
        package: extractPackageName(file)
      });
    }

    dependencyGraph[file].forEach(dep => {
      if (!(dep in idMap)) {
        idMap[dep] = idCounter++;
        nodes.push({
          id: idMap[dep],
          name: dep,
          package: extractPackageName(dep)
        });
      }

      links.push({
        source: idMap[file],
        target: idMap[dep]
      });
    });
  });

  return { nodes, links };
}


function saveMadgeResult(filename, data) {
    const outputDir = path.resolve(__dirname, '../Output');

     // Ensure Output folder exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, filename);

    fs.writeFileSync(outputFile,JSON.stringify(data, null, 2));
    console.log(`Result saved to ${outputFile}`);

}

async function runMadge() {
    const projectPath = "C:\\Users\\aahmadridzuanullah\\alerting-service-public-master";

    try {

        const result = await madge(projectPath);
        const dependencyGraph = result.obj(); //Returns an Object with all dependencies.

        saveMadgeResult("madge_out.json", dependencyGraph);

        const output = convertDependencyGraph(dependencyGraph);
        saveMadgeResult("process_madge.json", output);


    } catch (err) {
        console.error("Madge failed", err);
    }
}

runMadge();