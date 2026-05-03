async function test() {
    // Step 1: Get topic IDs from a neuroscience search
    const worksRes = await fetch(
        'https://api.openalex.org/works?search=epigenetic+chromatin+neurons&per_page=10&select=id,topics,primary_location'
    );
    const works = await worksRes.json();

    const topicIds = [...new Set(
        works.results.flatMap(w => w.topics?.map(t => t.id.replace('https://openalex.org/', '')) || [])
    )].slice(0, 2);
    console.log('TOP TOPIC IDs:', topicIds);

    // Step 2: For each topic, fetch highly cited works and tally their source venues
    for (const topicId of topicIds) {
        const topicWorks = await fetch(
            `https://api.openalex.org/works?filter=topics.id:${topicId}&sort=cited_by_count:desc&per_page=20&select=primary_location,cited_by_count`
        );
        const tw = await topicWorks.json();
        console.log(`\nTOPIC ${topicId} — top cited works count: ${tw.meta?.count}`);

        // Tally sources
        const sourceTally = {};
        tw.results?.forEach(w => {
            const src = w.primary_location?.source;
            if (src?.display_name) {
                sourceTally[src.display_name] = (sourceTally[src.display_name] || 0) + 1;
            }
        });
        const sorted = Object.entries(sourceTally).sort((a, b) => b[1] - a[1]);
        console.log('Top venues in this topic:');
        sorted.slice(0, 8).forEach(([name, count]) => console.log(`  ${name}: ${count}`));
    }
}
test().catch(console.error);