import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const width = window.innerWidth;
const height = window.innerHeight;
const jsonFile = "../../Output/processed_all.json";
//const jsonFile = "../../Output/process_madge.json";

const svg = d3
	.select("#tree")
	.append("svg")
	.attr("width", width)
	.attr("height", height)
	.call(
		d3.zoom().on("zoom", (event) => {
			g.attr("transform", event.transform);
		})
	);

const g = svg.append("g").attr("transform", "translate(100,50)");

// disable double click zoom
const zoom = d3
	.zoom()
	.scaleExtent([0.1, 10])
	.on("zoom", (event) => {
		svg.select("g").attr("transform", event.transform);
	});

// Disable double-click zoom:
svg.call(zoom).on("dblclick.zoom", null);

d3.json(jsonFile).then((data) => {
	const repoBoxLayer = g.append("g").attr("class", "repo-boxes");
	const boxGroup = g.append("g").attr("class", "boxes");
	const linkGroup = g.append("g").attr("class", "links");
	const nodeGroup = g.append("g").attr("class", "nodes");
	const measureLayer = svg.append("g").attr("visibility", "hidden");
	let expandedRepoObjects = new Set();

	//
	// --- 1. Group into repos → packages → files ---
	//
	const repoMap = new Map();
	const packageMap = new Map();

	data.nodes.forEach((n) => {
		const repo = n.repo || "defaultRepo";
		const pkg = n.package || "root";

		if (!repoMap.has(repo)) {
			repoMap.set(repo, {
				id: "repo:" + repo,
				name: repo,
				type: "repo",
				packages: [],
			});
		}
		const repoNode = repoMap.get(repo);

		let pkgNode = repoNode.packages.find((p) => p.name === pkg);
		if (!pkgNode) {
			pkgNode = {
				id: `pkg:${repo}:${pkg}`,
				parentRepo: repo,
				name: pkg,
				type: "package",
				files: [],
			};
			repoNode.packages.push(pkgNode);
			packageMap.set(`${repo}:${pkg}`, pkgNode);
		}
		pkgNode.files.push({ ...n, type: "file" });
	});

	// initial nodes = repos only
	let nodes = Array.from(repoMap.values());

	// give repos initial positions so they don't start as NaN
	nodes.forEach((repo, i) => {
		repo.x = width / 2 + (i * 200 - 100);
		repo.y = height / 2;
	});

	//
	// --- 2. Package-level links ---
	//
	let links = data.links
		.map((l) => {
			const sNode = data.nodes.find((n) => n.id === l.source);
			const tNode = data.nodes.find((n) => n.id === l.target);

			if (!sNode || !tNode) return null;

			const sRepo = repoMap.get(sNode.repo);
			const tRepo = repoMap.get(tNode.repo);

			// ignore self-links inside a repo
			if (!sRepo || !tRepo || sRepo.id === tRepo.id) return null;

			return { source: sRepo, target: tRepo };
		})
		.filter((l) => l !== null);

	// deduplicate
	links = Array.from(
		new Set(links.map((l) => l.source.id + "->" + l.target.id))
	).map((key) => {
		const [s, t] = key.split("->");
		return {
			source: Array.from(repoMap.values()).find((r) => r.id === s),
			target: Array.from(repoMap.values()).find((r) => r.id === t),
		};
	});

	//
	// --- 3. Arrow markers ---
	//
	svg.append("defs")
		.selectAll("marker")
		.data([
			{ id: "arrows", color: "#aaa" },
			{ id: "arrows-out", color: "#ff6600" },
			{ id: "arrows-in", color: "#0066cc" },
		])
		.join("marker")
		.attr("id", (d) => d.id)
		.attr("viewBox", "0 -5 10 10")
		.attr("refX", 10)
		.attr("refY", 0)
		.attr("markerWidth", 10)
		.attr("markerHeight", 10)
		.attr("markerUnits", "userSpaceOnUse")
		.attr("orient", "auto")
		.append("svg:path")
		.attr("fill", (d) => d.color)
		.attr("d", "M 0,-5 L 10,0 L 0,5");

	//
	// --- 4. Draw nodes + links ---
	//
	let link = linkGroup
		.selectAll("path")
		.data(links)
		.join("path")
		.style("stroke", "#aaa")
		.attr("marker-end", "url(#arrows)");

	let node = nodeGroup
		.selectAll(".node")
		.data(nodes, (d) => d.id)
		.join((enter) => {
			const n = enter
				.append("g")
				.attr("class", "node")
				.call(
					d3
						.drag()
						.on("start", dragStarted)
						.on("drag", dragged)
						.on("end", dragEnded)
				);

			n.append("text")
				.attr("dy", 4)
				.style("text-anchor", "middle")
				.text((d) =>
					d.type === "package"
						? d.name
						: d.name.split("\\").pop().split("/").pop()
				);

			n.each(function (d) {
				const g = d3.select(this);
				const text = g.select("text");
				const bbox = text.node().getBBox();
				const paddingX = 10;
				const paddingY = 6;

				d.bboxWidth = bbox.width + paddingX;
				d.bboxHeight = bbox.height + paddingY;

				g.insert("rect", "text")
					.attr("x", bbox.x - paddingX / 2)
					.attr("y", bbox.y - paddingY / 2)
					.attr("width", d.bboxWidth)
					.attr("height", d.bboxHeight)
					.attr("rx", 6)
					.attr("ry", 6)
					.attr("fill", "#fff")
					.attr("stroke", "#000");
			});

			return n;
		});

	//
	// --- 5. Node interaction ---
	//
	let selectedNode = null;
	let expandedPackages = new Set();
	let groupBoxes = [];
	let groupRepoBoxes = [];

	function handleClick(event, d) {
		if (selectedNode === d) {
			selectedNode = null;
			node.select("rect").attr("fill", "#fff");
			link.attr("marker-end", "url(#arrows)")
				.style("stroke", "#aaa")
				.style("stroke-width", 1)
				.attr("opacity", 1);
			return;
		}

		selectedNode = d;

		node.select("rect").attr("fill", "#fff");
		d3.select(this).select("rect").attr("fill", "#ffcc00");

		// recolouring nodes
		node.select("rect").attr("fill", (n) => {
			if (n === d) return "#ffcc00";
			const isOutgoing = link
				.data()
				.some((l) => l.source === d && l.target === n);
			const isIncoming = link
				.data()
				.some((l) => l.target === d && l.source === n);
			if (isOutgoing && isIncoming) {
				//d.bidirectional = true;
				return "#3aca6fff";
			}
			//d.bidirectional = false;
			if (isOutgoing) return "#ff9966";
			if (isIncoming) return "#66b3ff";
			return "#fff";
		});

		// recolouring links
		link.attr("marker-end", (l) => {
			if (l.source === d) return "url(#arrows-out)";
			if (l.target === d) return "url(#arrows-in)";
			return "url(#arrows)";
		})
			.style("stroke", (l) => {
				//console.log(d.bidirectional);
				//if (d.bidirectional) return "#3aca6fff";
				if (l.source === d) return "#ff6600";
				if (l.target === d) return "#0066cc";
				return "#aaa";
			})
			.style("stroke-width", (l) =>
				l.source === d || l.target === d ? 3 : 1.5
			)
			.attr("opacity", (l) =>
				l.source === d || l.target === d ? 1 : 0.2
			);
	}

	function handleDblClick(event, d) {
		if (d.type === "repo") {
			// Expand repo → its packages
			if (expandedRepoObjects.has(d.id)) {
				collapseRepo(d);
			} else {
				expandRepo(d);
			}
			restart();
		} else if (d.type === "package") {
			// Expand / collapse package → files
			if (expandedPackages.has(d.id)) {
				collapsePackage(d);
			} else {
				expandPackage(d);
			}
			restart();
		} else {
			// File nodes still open code
			showCodeSnippet(d);
		}
	}

	function expandRepo(repoNode) {
		nodes = nodes.filter((n) => n.id !== repoNode.id);
		const packages = repoNode.packages;

		// Compute package grid size
		const maxW = d3.max(packages, (p) => p.bboxWidth || 60);
		const maxH = d3.max(packages, (p) => p.bboxHeight || 30);
		const paddingX = 300;
		const paddingY = 60;
		const spacing = { x: maxW + paddingX, y: maxH + paddingY };

		const nCols = Math.ceil(Math.sqrt(packages.length));
		const nRows = Math.ceil(packages.length / nCols);

		// Get a starting non-overlapping position
		const totalWidth = nCols * spacing.x;
		const totalHeight = nRows * spacing.y;

		const pos = findNonOverlappingPosition(
			totalWidth,
			totalHeight,
			nodes.filter((n) => n.type === "package" || n.type === "repo"),
			repoNode.x,
			repoNode.y
		);

		const startX = pos.x - ((nCols - 1) * spacing.x) / 2;
		const startY = pos.y - ((nRows - 1) * spacing.y) / 2;

		packages.forEach((p, i) => {
			const col = i % nCols;
			const row = Math.floor(i / nCols);
			p.x = startX + col * spacing.x;
			p.y = startY + row * spacing.y;
			p.vx = p.vx || 0;
			p.vy = p.vy || 0;
		});

		nodes.push(...packages);
		expandedRepoObjects.add(repoNode);
		groupRepoBoxes.push({
			repoId: repoNode.id,
			name: `repo:${repoNode.name}`,
			packages: packages,
		});

		updateLinks();
		restart();
		updateRepoBoxes();
	}

	function collapseRepo(repoNode) {
		expandedRepoObjects.delete(repoNode);

		// collapse all packages first
		repoNode.packages.forEach((d) => {
			if (expandedPackages.has(d.id)) {
				collapsePackage(d);
			}
		});

		// remove package nodes + bounding box
		nodes = nodes.filter((n) => !repoNode.packages.includes(n));
		//groupRepoBoxes = groupRepoBoxes.filter((g) => g.repoId !== repoNode.id);

		// add back package node
		nodes.push(repoNode);

		updateLinks();
		restart();
	}

	node.on("click", handleClick);

	node.on("dblclick", handleDblClick);

	// rebuild links depending on which nodes are visible
	function updateLinks() {
		let newLinks = [];

		data.links.forEach((l) => {
			const sNode = data.nodes.find((n) => n.id === l.source);
			const tNode = data.nodes.find((n) => n.id === l.target);
			if (!sNode || !tNode) return;

			// resolve visible node for source
			let sVisible = nodes.find((n) => n.id === sNode.id); // file visible?
			if (!sVisible && sNode.package) {
				sVisible = nodes.find(
					(n) => n.id === `pkg:${sNode.repo}:${sNode.package}`
				);
			}
			if (!sVisible) {
				sVisible = nodes.find((n) => n.id === `repo:${sNode.repo}`);
			}

			// resolve visible node for target
			let tVisible = nodes.find((n) => n.id === tNode.id); // file visible?
			if (!tVisible && tNode.package) {
				tVisible = nodes.find(
					(n) => n.id === `pkg:${tNode.repo}:${tNode.package}`
				);
			}
			if (!tVisible) {
				tVisible = nodes.find((n) => n.id === `repo:${tNode.repo}`);
			}

			// only keep links between valid visible nodes
			if (sVisible && tVisible && sVisible.id !== tVisible.id) {
				newLinks.push({ source: sVisible, target: tVisible });
			}
		});

		// deduplicate safely
		const linkMap = new Map();
		newLinks.forEach((l) => {
			const key = l.source.id + "->" + l.target.id;
			if (!linkMap.has(key)) linkMap.set(key, l);
		});

		links = Array.from(linkMap.values());
	}

	//
	// --- 6. Expand / Collapse packages ---
	//
	const pkgSpacing = new Map();

	function fileLabel(f) {
		return (f.name || "").split("\\").pop().split("/").pop();
	}

	function measureTextWidth(txt) {
		const t = measureLayer.append("text").text(txt);
		const w = t.node().getComputedTextLength();
		t.remove();
		return w;
	}

	function expandPackage(pkgNode) {
		expandedPackages.add(pkgNode.id);

		// remove the package node itself
		nodes = nodes.filter((n) => n.id !== pkgNode.id);

		const files = pkgNode.files;

		// compute & cache spacing once
		let spacing = pkgSpacing.get(pkgNode.id);
		if (!spacing) {
			const paddingX = 10;
			const paddingY = 6;

			const maxW =
				d3.max(files, (f) => measureTextWidth(fileLabel(f))) + paddingX;
			const maxH = 12 + paddingY;

			spacing = { x: maxW * 1.8, y: maxH * 2.2 };
			pkgSpacing.set(pkgNode.id, spacing);
		}

		// lay out files inside this package
		const nCols = Math.ceil(Math.sqrt(files.length));
		const nRows = Math.ceil(files.length / nCols);

		const startX = pkgNode.x - ((nCols - 1) * spacing.x) / 2;
		const startY = pkgNode.y - ((nRows - 1) * spacing.y) / 2;

		files.forEach((f, i) => {
			const col = i % nCols;
			const row = Math.floor(i / nCols);
			f.x = startX + col * spacing.x;
			f.y = startY + row * spacing.y * 2;
			f.fx = f.x;
			f.fy = f.y;
		});

		// save bounding box size for this package
		pkgNode.bboxWidth = nCols * spacing.x;
		pkgNode.bboxHeight = nRows * spacing.y * 2;

		// add file nodes
		nodes.push(...files);

		// add bounding box metadata
		groupBoxes.push({
			packageId: pkgNode.id,
			name: `package:${pkgNode.name}`,
			files,
			parentRepo: pkgNode.parentRepo,
			pkgNode,
		});

		// --- NEW: re-layout all packages (collapsed + expanded) in this repo ---
		const repoNode = repoMap.get(pkgNode.parentRepo);
		if (repoNode) {
			layoutRepoPackages(repoNode);
		}

		updateLinks();
		restart();
		updateBoxes();
		updateRepoBoxes();
	}

	function layoutRepoPackages(repoNode) {
		if (!repoNode || !repoNode.packages || repoNode.packages.length === 0)
			return;

		const pkgs = repoNode.packages;
		const padding = 40; // gap between package cells

		// compute each package's width/height (expanded packages have bboxWidth/Height set)
		const widths = pkgs.map((p) => p.bboxWidth || 60);
		const heights = pkgs.map((p) => p.bboxHeight || 30);

		const maxW = d3.max(widths);
		const maxH = d3.max(heights);

		// cell size is uniform (simpler and avoids column math)
		const cellW = maxW + padding;
		const cellH = maxH + padding;

		// grid dims
		const nCols = Math.max(1, Math.ceil(Math.sqrt(pkgs.length)));
		const nRows = Math.ceil(pkgs.length / nCols);

		// center the grid on the repoNode center
		const startX = (repoNode.x || 0) - ((nCols - 1) * cellW) / 2;
		const startY = (repoNode.y || 0) - ((nRows - 1) * cellH) / 2;

		pkgs.forEach((pkg, i) => {
			const col = i % nCols;
			const row = Math.floor(i / nCols);

			const centerX = startX + col * cellW;
			const centerY = startY + row * cellH;

			// find groupBoxes entry if package is expanded
			const gb = groupBoxes.find((g) => g.packageId === pkg.id);

			// compute current visible center (for expanded -> center of files; for collapsed -> pkg.x/pkg.y)
			let currentCenterX = pkg.x || 0;
			let currentCenterY = pkg.y || 0;
			if (gb && gb.files && gb.files.length) {
				// use mean of file positions (more robust than min/max center)
				currentCenterX = d3.mean(gb.files, (f) => f.x);
				currentCenterY = d3.mean(gb.files, (f) => f.y);
			}

			const dx = centerX - currentCenterX;
			const dy = centerY - currentCenterY;

			// if expanded, translate all files so the visible box moves to center
			if (gb && gb.files && gb.files.length) {
				gb.files.forEach((f) => {
					f.x = (f.x || 0) + dx;
					f.y = (f.y || 0) + dy;
					f.fx = f.x;
					f.fy = f.y;
				});

				// also update stored pkgNode center if present
				if (gb.pkgNode) {
					gb.pkgNode.x = centerX;
					gb.pkgNode.y = centerY;
					gb.pkgNode.fx = gb.pkgNode.x;
					gb.pkgNode.fy = gb.pkgNode.y;
				}
			}

			// for collapsed package, or to keep a canonical center for both cases:
			pkg.x = centerX;
			pkg.y = centerY;
			if (pkg.fx != null) {
				pkg.fx = pkg.x;
				pkg.fy = pkg.y;
			}

			// keep any visible package node in `nodes` in-sync
			const visiblePkgNode = nodes.find((n) => n.id === pkg.id);
			if (visiblePkgNode) {
				visiblePkgNode.x = pkg.x;
				visiblePkgNode.y = pkg.y;
				visiblePkgNode.fx = pkg.fx;
				visiblePkgNode.fy = pkg.fy;
			}
		});

		// redraw visuals
		updateBoxes();
		updateRepoBoxes();

		// nudge simulation so links & others can settle
		simulation.alpha(0.2).restart();
	}

	// Collapse package back into single node
	function collapsePackage(pkgNode) {
		expandedPackages.delete(pkgNode.id);

		// remove file nodes + bounding box
		nodes = nodes.filter((n) => !pkgNode.files.includes(n));
		groupBoxes = groupBoxes.filter((g) => g.packageId !== pkgNode.id);

		// add back package node
		nodes.push(pkgNode);

		updateLinks();
		restart();
	}

	// restart sim
	function restart() {
		link = linkGroup
			.selectAll("path")
			.data(links)
			.join("path")
			.style("stroke", "#aaa")
			.attr("marker-end", "url(#arrows)");

		node = nodeGroup
			.selectAll(".node")
			.data(nodes, (d) => d.id)
			.join(
				(enter) => {
					const n = enter
						.append("g")
						.attr("class", "node")
						.call(
							d3
								.drag()
								.on("start", dragStarted)
								.on("drag", dragged)
								.on("end", dragEnded)
						);

					n.append("text")
						.attr("dy", 4)
						.style("text-anchor", "middle")
						.text((d) => d.name.split("\\").pop().split("/").pop());

					n.each(function (d) {
						const g = d3.select(this);
						const text = g.select("text");
						const bbox = text.node().getBBox();
						const paddingX = 10;
						const paddingY = 6;

						d.bboxWidth = bbox.width + paddingX;
						d.bboxHeight = bbox.height + paddingY;

						g.insert("rect", "text")
							.attr("x", bbox.x - paddingX / 2)
							.attr("y", bbox.y - paddingY / 2)
							.attr("width", d.bboxWidth)
							.attr("height", d.bboxHeight)
							.attr("rx", 6)
							.attr("ry", 6)
							.attr("fill", "#fff")
							.attr("stroke", "#000");
					});
					return n;
				},
				(update) => update,
				(exit) => exit.remove()
			);

		// rebind onclick and ondblclick
		node.on("click", handleClick);
		node.on("dblclick", handleDblClick);

		// draw bounding boxes for expanded packages
		let boxes = boxGroup
			.selectAll(".pkg-box")
			.data(groupBoxes, (d) => d.packageId);

		// ENTER: create new <g> elements
		const boxesEnter = boxes.enter().append("g").attr("class", "pkg-box");

		boxesEnter.call(
			d3
				.drag()
				.on("start", boxDragStarted)
				.on("drag", boxDragged)
				.on("end", boxDragEnded)
		);

		// Append a <rect> inside each new <g>
		boxesEnter
			.append("rect")
			.attr("rx", 12)
			.attr("ry", 12)
			.attr("fill", "rgba(200,200,255,0.15)")
			.attr("stroke", "#666")
			.attr("stroke-dasharray", "4 2")
			.lower()
			.on("dblclick", (event, d) => {
				const pkgNode = packageMap.get(
					`${d.parentRepo}:${d.name.substring(8)}`
				);
				collapsePackage(pkgNode);
			});

		// append package name text at top-left
		boxesEnter
			.append("text")
			.attr("class", "pkg-name")
			.attr("x", 8) // padding inside rect
			.attr("y", 14)
			.text((d) => d.name)
			.attr("font-size", "12px")
			.attr("font-weight", "bold")
			.attr("fill", "#333")
			.raise();

		// EXIT: remove boxes no longer in data
		boxes.exit().remove();

		// update box positions every tick
		simulation.on("tick", () => {
			link.attr("d", (d) => {
				const targetRectWidth = d.target.bboxWidth || 100;
				const targetRectHeight = d.target.bboxHeight || 30;

				const dx = d.target.x - d.source.x;
				const dy = d.target.y - d.source.y;

				const hw = targetRectWidth / 2;
				const hh = targetRectHeight / 2;

				const scaleX = hw / Math.abs(dx || 1);
				const scaleY = hh / Math.abs(dy || 1);
				const scale = Math.min(scaleX, scaleY);

				const endX = d.target.x - dx * scale;
				const endY = d.target.y - dy * scale;

				return `M${d.source.x},${d.source.y} L${endX},${endY}`;
			});

			node.attr("transform", (d) => `translate(${d.x},${d.y})`);

			// bounding boxes follow files
			g.selectAll(".pkg-box").each(function (d) {
				const minX =
					d3.min(d.files, (f) => f.x - (f.bboxWidth || 50) / 2) - 20;
				const maxX =
					d3.max(d.files, (f) => f.x + (f.bboxWidth || 50) / 2) + 20;
				const minY =
					d3.min(d.files, (f) => f.y - (f.bboxHeight || 20) / 2) - 20;
				const maxY =
					d3.max(d.files, (f) => f.y + (f.bboxHeight || 20) / 2) + 20;

				const boxWidth = maxX - minX;
				const boxHeight = maxY - minY + 30;

				const gBox = d3
					.select(this)
					.attr("transform", `translate(${minX},${minY - 20})`);

				gBox.select("rect")
					.attr("x", 0)
					.attr("y", 0)
					.attr("width", boxWidth)
					.attr("height", boxHeight);

				gBox.select("text.pkg-name").attr("x", 8).attr("y", 16);
			});
		});

		simulation.force("link").links(links);
		//simulation.nodes(nodes);
		simulation.tick();
		ticked();
		updateBoxes();
		updateRepoBoxes();
		forceRepoBoxRepel();
	}

	//
	// --- 7. Force simulation ---
	//
	const simulation = d3
		.forceSimulation(nodes)
		.force(
			"link",
			d3
				.forceLink()
				.id((d) => d.id)
				.links(links)
		)
		.force("charge", d3.forceManyBody().strength(-1000))
		.force("x", d3.forceX())
		.force("y", d3.forceY())
		.force("center", d3.forceCenter(width / 2, height / 2))
		.force(
			"collide",
			d3.forceCollide((d) => 130)
		)
		.force("repoBoxRepel", forceRepoBoxRepel)
		//.force("boxRepel", forceBoxRepel(-5))
		.alphaDecay(0.05)
		.velocityDecay(0.5)
		.on("tick", ticked);

	function ticked() {
		link.attr("d", linkPath);

		node.attr("transform", (d) => `translate(${d.x},${d.y})`);

		updateBoxes();
		updateRepoBoxes();
	}

	//
	// --- 8. Drag handlers ---
	//
	function linkPath(d) {
		const getEdgePoint = (source, target) => {
			const w = source.bboxWidth || 100;
			const h = source.bboxHeight || 30;

			const dx = target.x - source.x;
			const dy = target.y - source.y;

			const hw = w / 2;
			const hh = h / 2;

			const scaleX = hw / Math.abs(dx || 1);
			const scaleY = hh / Math.abs(dy || 1);
			const scale = Math.min(scaleX, scaleY);

			return {
				x: source.x + dx * scale,
				y: source.y + dy * scale,
			};
		};

		const p1 = getEdgePoint(d.source, d.target);
		const p2 = getEdgePoint(d.target, d.source);

		return `M${p1.x},${p1.y} L${p2.x},${p2.y}`;
	}

	function dragStarted(event, d) {
		d.fx = d.x;
		d.fy = d.y;
	}

	function dragged(event, d) {
		d.x = event.x;
		d.y = event.y;
		d.fx = event.x;
		d.fy = event.y;
		// Let the tick handler move links/nodes. But keep boxes in sync now:
		updateBoxes();
		updateRepoBoxes();
		//simulation.alpha(0).restart();

		// move dragged node
		d3.select(this).attr("transform", `translate(${event.x},${event.y})`);

		// update link positions using rectangle edge math
		link.attr("d", linkPath);
	}

	function dragEnded(event, d) {
		d.fx = event.x;
		d.fy = event.y;
	}

	function boxDragStarted(event, d) {
		// Fix positions of all children before drag
		d.files.forEach((f) => {
			f.fx = f.x;
			f.fy = f.y;
		});
	}

	function boxDragged(event, d) {
		const dx = event.dx || 0;
		const dy = event.dy || 0;

		// move files
		d.files.forEach((f) => {
			f.fx += dx;
			f.fy += dy;
			f.x = f.fx;
			f.y = f.fy;
		});

		// also move the underlying package node reference
		if (d.pkgNode) {
			d.pkgNode.x = (d.pkgNode.x || 0) + dx;
			d.pkgNode.y = (d.pkgNode.y || 0) + dy;

			if (d.pkgNode.fx != null) {
				d.pkgNode.fx += dx;
				d.pkgNode.fy += dy;
			} else {
				d.pkgNode.fx = d.pkgNode.x;
				d.pkgNode.fy = d.pkgNode.y;
			}
		}

		updateBoxes();
		updateRepoBoxes(); // now repo box sees new pkgNode coords
		simulation.alpha(0).restart();
	}

	function boxDragEnded(event, d) {
		// Release all children so sim can move them again
		d.files.forEach((f) => {
			f.fx = f.x;
			f.fy = f.y;
		});
		//updateBoxes(); // resize + reposition box
	}

	function repoBoxDragStarted(event, d) {
		// Fix positions of all children before drag
		d.packages.forEach((f) => {
			f.fx = f.x;
			f.fy = f.y;
		});
	}

	function repoBoxDragged(event, repoNode) {
		const dx = event.dx || 0;
		const dy = event.dy || 0;

		// update repo's own center (optional bookkeeping)
		repoNode.x = (repoNode.x || 0) + dx;
		repoNode.y = (repoNode.y || 0) + dy;

		// 1. move all package nodes (expanded or not)
		(repoNode.packages || []).forEach((pkg) => {
			pkg.x = (pkg.x || 0) + dx;
			pkg.y = (pkg.y || 0) + dy;

			if (pkg.fx != null) {
				pkg.fx += dx;
				pkg.fy += dy;
			} else {
				pkg.fx = pkg.x;
				pkg.fy = pkg.y;
			}

			// 2. move all files in this package
			(pkg.files || []).forEach((f) => {
				f.x = (f.x || 0) + dx;
				f.y = (f.y || 0) + dy;

				if (f.fx != null) {
					f.fx += dx;
					f.fy += dy;
				} else {
					f.fx = f.x;
					f.fy = f.y;
				}
			});
		});

		// 3. Optional: nudge drawn pkg-box <g> elements for immediate visual feedback
		g.selectAll(".pkg-box")
			.filter((pb) => pb.repo === repoNode.id)
			.each(function (pb) {
				const el = d3.select(this);
				const prev = el.attr("transform") || "translate(0,0)";
				const m = prev.match(
					/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/
				);
				let x = 0,
					y = 0;
				if (m) {
					x = +m[1];
					y = +m[2];
				}
				x += dx;
				y += dy;
				el.attr("transform", `translate(${x},${y})`);
			});

		// redraw bounding boxes
		updateBoxes();
		updateRepoBoxes();

		// restart simulation
		simulation.alpha(0).restart();
	}

	function repoBoxDragEnded(event, d) {
		// Release all children so sim can move them again
		d.packages.forEach((f) => {
			f.fx = f.x;
			f.fy = f.y;
		});
		//updateBoxes(); // resize + reposition box
	}

	function updateBoxes() {
		g.selectAll(".pkg-box").each(function (d) {
			// make sure this package has files
			if (!d || !d.files || d.files.length === 0) {
				console.warn("no files for box:", d);
				return;
			}

			// calculate bounds from children
			const minX =
				d3.min(d.files, (f) => (f.x || 0) - (f.bboxWidth || 50) / 2) -
				20;
			const maxX =
				d3.max(d.files, (f) => (f.x || 0) + (f.bboxWidth || 50) / 2) +
				20;
			const minY =
				d3.min(d.files, (f) => (f.y || 0) - (f.bboxHeight || 20) / 2) -
				20;
			const maxY =
				d3.max(d.files, (f) => (f.y || 0) + (f.bboxHeight || 20) / 2) +
				20;

			// box dimensions
			const boxWidth = maxX - minX;
			const boxHeight = maxY - minY + 30; // +30 for title space

			// Persist bounds into the data for forceBoxRepel
			d.bounds = { minX, maxX, minY, maxY };
			d.repulsionBounds = {
				minX: minX - 40,
				maxX: maxX + 40,
				minY: minY - 40,
				maxY: maxY + 40,
			};

			// move the whole group to top-left corner
			const gBox = d3
				.select(this)
				.attr("transform", `translate(${minX},${minY - 20})`);

			// update rect
			gBox.select("rect")
				.attr("x", 0)
				.attr("y", 0)
				.attr("width", boxWidth)
				.attr("height", boxHeight);

			// update package name label
			gBox.select("text.pkg-name").attr("x", 8).attr("y", 16);
		});
	}

	function updateRepoBoxes() {
		// repos that have visible packages
		//console.log(expandedRepoObjects);
		const repoBoxes = repoBoxLayer
			.selectAll(".repo-box")
			.data(expandedRepoObjects, (d) => d.id);

		// ENTER
		const boxEnter = repoBoxes
			.enter()
			.append("g")
			.attr("class", "repo-box");

		boxEnter.call(
			d3
				.drag()
				.on("start", repoBoxDragStarted)
				.on("drag", repoBoxDragged)
				.on("end", repoBoxDragEnded)
		);

		boxEnter
			.append("rect")
			.attr("rx", 12)
			.attr("ry", 12)
			.attr("fill", "#f0f0f0")
			.attr("stroke", "#999")
			.attr("stroke-width", 1.5)
			.attr("opacity", 0.3)
			.on("dblclick", (event, d) => {
				const repoNode = repoMap.get(d.name);
				collapseRepo(repoNode);
			});

		boxEnter
			.append("text")
			.attr("class", "repo-name")
			.style("font-size", "12px")
			.style("font-weight", "bold")
			.attr("fill", "#333");

		// EXIT
		repoBoxes.exit().remove();

		// MERGE enter + update
		const boxesMerge = boxEnter.merge(repoBoxes);

		boxesMerge.each(function (d) {
			const packages = d.packages;
			if (!packages.length) return;

			const minX =
				d3.min(packages, (p) => (p.x || 0) - (p.bboxWidth || 60) / 2) -
				30;
			const maxX =
				d3.max(packages, (p) => (p.x || 0) + (p.bboxWidth || 60) / 2) +
				30;
			const minY =
				d3.min(packages, (p) => (p.y || 0) - (p.bboxHeight || 30) / 2) -
				30;
			const maxY =
				d3.max(packages, (p) => (p.y || 0) + (p.bboxHeight || 30) / 2) +
				30;

			const boxWidth = maxX - minX;
			const boxHeight = maxY - minY + 30;

			// save bounds for force
			d.bounds = { minX, maxX, minY, maxY };

			const gBox = d3
				.select(this)
				.attr("transform", `translate(${minX},${minY - 20})`);

			// ALWAYS update rect and text
			gBox.select("rect")
				.attr("width", boxWidth)
				.attr("height", boxHeight);

			gBox.select("text.repo-name").attr("x", 8).attr("y", 16).text(d.id);
		});
	}

	function findNonOverlappingPosition(
		newWidth,
		newHeight,
		existingBoxes,
		startX,
		startY,
		padding = 50
	) {
		let x = startX;
		let y = startY;
		let safe = false;
		let attempts = 0;

		while (!safe && attempts < 1000) {
			safe = true;
			for (let box of existingBoxes) {
				const bx = box.x || 0;
				const by = box.y || 0;
				const bw = box.bboxWidth || 100;
				const bh = box.bboxHeight || 50;

				const overlapX = Math.max(
					0,
					Math.min(x + newWidth / 2, bx + bw / 2) -
						Math.max(x - newWidth / 2, bx - bw / 2)
				);
				const overlapY = Math.max(
					0,
					Math.min(y + newHeight / 2, by + bh / 2) -
						Math.max(y - newHeight / 2, by - bh / 2)
				);

				if (overlapX > 0 && overlapY > 0) {
					safe = false;
					x += newWidth + padding; // move to the right
					if (x > window.innerWidth - newWidth) {
						x = padding;
						y += newHeight + padding; // move down if hit edge
					}
					break;
				}
			}
			attempts++;
		}
		return { x, y };
	}

	function forceRepoBoxRepel() {
		for (let i = 0; i < expandedRepoObjects.length; i++) {
			const a = expandedRepoObjects[i];
			const aBounds = a.bounds || {
				minX: a.x - 50,
				maxX: a.x + 50,
				minY: a.y - 50,
				maxY: a.y + 50,
			};
			for (let j = i + 1; j < expandedRepoObjects.length; j++) {
				const b = expandedRepoObjects[j];
				const bBounds = b.bounds || {
					minX: b.x - 50,
					maxX: b.x + 50,
					minY: b.y - 50,
					maxY: b.y + 50,
				};

				// compute horizontal overlap
				const overlapX = Math.max(
					0,
					Math.min(aBounds.maxX, bBounds.maxX) -
						Math.max(aBounds.minX, bBounds.minX)
				);
				const overlapY = Math.max(
					0,
					Math.min(aBounds.maxY, bBounds.maxY) -
						Math.max(aBounds.minY, bBounds.minY)
				);

				if (overlapX > 0 && overlapY > 0) {
					// push them apart along the largest overlap
					const pushX = overlapX * 0.5;
					const pushY = overlapY * 0.5;

					if (overlapX > overlapY) {
						// push horizontally
						a.packages.forEach((p) => {
							p.vx += pushX;
						});
						b.packages.forEach((p) => {
							p.vx -= pushX;
						});
						a.x += pushX;
						b.x -= pushX;
					} else {
						// push vertically
						a.packages.forEach((p) => {
							p.vy += pushY;
						});
						b.packages.forEach((p) => {
							p.vy -= pushY;
						});
						a.y += pushY;
						b.y -= pushY;
					}
				}
			}
		}
	}

	// 	function forceBoxRepel(strength = -0.8) {
	// 		let nodes;

	// 		function force(alpha) {
	// 			if (!nodes) return;

	// 			// 1. Box ↔ Node repel
	// 			groupBoxes.forEach((box) => {
	// 				if (!box.bounds) return;
	// 				const { minX, maxX, minY, maxY } = box.bounds;

	// 				nodes.forEach((n) => {
	// 					if (box.files.includes(n)) return; // skip children

	// 					const insideX = n.x > minX && n.x < maxX;
	// 					const insideY = n.y > minY && n.y < maxY;

	// 					if (insideX && insideY) {
	// 						const dx = Math.min(n.x - minX, maxX - n.x);
	// 						const dy = Math.min(n.y - minY, maxY - n.y);

	// 						if (dx < dy) {
	// 							n.vx +=
	// 								(n.x < (minX + maxX) / 2 ? -1 : 1) *
	// 								Math.abs(strength) *
	// 								alpha *
	// 								10;
	// 						} else {
	// 							n.vy +=
	// 								(n.y < (minY + maxY) / 2 ? -1 : 1) *
	// 								Math.abs(strength) *
	// 								alpha *
	// 								10;
	// 						}
	// 					}
	// 				});
	// 			});

	// 			// 2. Box ↔ Box repel
	// 			for (let i = 0; i < groupBoxes.length; i++) {
	// 				for (let j = i + 1; j < groupBoxes.length; j++) {
	// 					const a = groupBoxes[i];
	// 					const b = groupBoxes[j];
	// 					if (!a.bounds || !b.bounds) continue;

	// 					const overlapX =
	// 						Math.min(a.bounds.maxX, b.bounds.maxX) -
	// 						Math.max(a.bounds.minX, b.bounds.minX);
	// 					const overlapY =
	// 						Math.min(a.bounds.maxY, b.bounds.maxY) -
	// 						Math.max(a.bounds.minY, b.bounds.minY);

	// 					if (overlapX > 0 && overlapY > 0) {
	// 						// overlap exists → push boxes apart
	// 						const centerAx = (a.bounds.minX + a.bounds.maxX) / 2;
	// 						const centerAy = (a.bounds.minY + a.bounds.maxY) / 2;
	// 						const centerBx = (b.bounds.minX + b.bounds.maxX) / 2;
	// 						const centerBy = (b.bounds.minY + b.bounds.maxY) / 2;

	// 						const dx = centerBx - centerAx;
	// 						const dy = centerBy - centerAy;
	// 						const dist = Math.sqrt(dx * dx + dy * dy) || 1;

	// 						const push =
	// 							(Math.min(overlapX, overlapY) / dist) *
	// 							strength *
	// 							alpha *
	// 							20;

	// 						// apply to all files in each package
	// 						a.files.forEach((n) => {
	// 							n.vx += (dx / dist) * push;
	// 							n.vy += (dy / dist) * push;
	// 						});
	// 						b.files.forEach((n) => {
	// 							n.vx -= (dx / dist) * push;
	// 							n.vy -= (dy / dist) * push;
	// 						});
	// 					}
	// 				}
	// 			}
	// 		}

	// 		force.initialize = (_) => (nodes = _);
	// 		return force;
	// 	}
});

// Redirect to VSCode upon double clicking a file
function showCodeSnippet(nodeData) {
	if (!nodeData.name) return;
	const filePath = nodeData.name.replace(/\\/g, "/");
	const vscodeUri = `vscode://file/${filePath}:1`;
	window.location.href = vscodeUri;
}
