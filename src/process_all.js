const { processDepends } = require("./process_depends.js");
const { runMadge } = require("./process_madge.js");
const fs = require("fs").promises;

async function processDependencies(rootPath) {
	const dependsRes = await processDepends(rootPath);
	const madgeRes = await runMadge(rootPath);

	for (i = 0; i < madgeRes.nodes.length; i++) {
		madgeRes.nodes[i].id = madgeRes.nodes[i].id + dependsRes.nodes.length;
	}

	for (i = 0; i < madgeRes.links.length; i++) {
		madgeRes.links[i].source =
			madgeRes.links[i].source + dependsRes.nodes.length;
		madgeRes.links[i].target =
			madgeRes.links[i].target + dependsRes.nodes.length;
	}

	const filePath = "..\\Output\\";
	let res = { ...dependsRes };
	res.nodes = res.nodes.concat(madgeRes.nodes);
	res.links = res.links.concat(madgeRes.links);
	//console.log(madgeRes.nodes);

	await fs.writeFile(
		`${filePath}processed_all.json`,
		JSON.stringify(res, null, 2),
		"utf8",
		(err) => {
			if (err) {
				console.error(err);
			}
		}
	);
	console.log(`Saved processed file at: ${filePath}processed_all.json`);
	return res;
}

const rootPath =
	//"C:\\Users\\yosoo\\OneDrive - Deloitte (O365D)\\Documents\\maybank assignment\\backend-assignment";
	//"C:\\Users\\yosoo\\OneDrive - Deloitte (O365D)\\Documents\\App Modernisation\\talent-review\\test";
	"C:\\Users\\yosoo\\OneDrive - Deloitte (O365D)\\Documents\\App Modernisation\\talent-review\\frontend\\hr-talent-review-web";

processDependencies(rootPath);
