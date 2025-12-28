import { storage } from './storage';

interface RepoContext {
    structure: string;
    dependencies: string;
    readme: string;
}

export async function fetchRepoContext(repoUrl: string): Promise<RepoContext> {
    // Extract owner/repo from URL (e.g., https://github.com/daylanwhitney/ez-files)
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) throw new Error("Invalid GitHub URL");

    let [_, owner, repo] = match;
    repo = repo.replace(/\.git$/, ''); // Strip .git suffix if present
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    const token = await storage.getGithubToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // 0. Fetch Repo Metadata to get Default Branch
    const metaResponse = await fetch(baseUrl, { headers });
    if (!metaResponse.ok) {
        if (metaResponse.status === 404) {
            throw new Error("Repository not found (Double check URL or Token permissions)");
        }
        if (metaResponse.status === 401) throw new Error("GitHub Token Invalid or Expired");
        if (metaResponse.status === 403) throw new Error("GitHub API rate limit exceeded or Forbidden");
        throw new Error(`GitHub API Error: ${metaResponse.status}`);
    }
    const metaData = await metaResponse.json();
    const defaultBranch = metaData.default_branch || 'main'; // Fallback just in case

    // 1. Fetch File Tree (Recursive)
    const treeResponse = await fetch(`${baseUrl}/git/trees/${defaultBranch}?recursive=1`, { headers });
    if (!treeResponse.ok) throw new Error("Failed to fetch repository file tree");

    const treeData = await treeResponse.json();

    // Check if truncated (API limit)
    if (treeData.truncated) console.warn("Repo tree is too large, results truncated");

    const structure = treeData.tree
        ? treeData.tree
            .map((item: any) => item.path)
            .filter((path: string) => !path.startsWith('.') && !path.match(/\.(png|jpg|jpeg|svg|gif|lock|ico|pdf|zip)$/))
            .slice(0, 300) // Limit to 300 files
            .join('\n')
        : '';

    // 2. Fetch package.json
    let dependencies = "{}";
    try {
        const pkgResponse = await fetch(`${baseUrl}/contents/package.json?ref=${defaultBranch}`, { headers });
        if (pkgResponse.ok) {
            const pkgData = await pkgResponse.json();
            const pkgContent = pkgData.content ? atob(pkgData.content) : "{}";
            const pkgJson = JSON.parse(pkgContent);
            dependencies = JSON.stringify({ ...pkgJson.dependencies, ...pkgJson.devDependencies }, null, 2);
        }
    } catch (e) {
        // package.json might not exist, which is fine
        console.log("No package.json found or failed to parse");
    }

    // 3. Fetch README
    let readme = "";
    try {
        const readmeResponse = await fetch(`${baseUrl}/readme?ref=${defaultBranch}`, { headers });
        if (readmeResponse.ok) {
            const readmeData = await readmeResponse.json();
            readme = readmeData.content ? atob(readmeData.content) : "";
        }
    } catch (e) {
        // README might not exist
        console.log("No README found");
    }

    return { structure, dependencies, readme };
}

export async function verifyGithubToken(token: string): Promise<boolean> {
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        return response.ok;
    } catch (e) {
        console.warn("GitHub Verification Failed:", e);
        return false;
    }
}

export async function fetchUserRepos(): Promise<string[]> {
    try {
        const token = await storage.getGithubToken();
        if (!token) {
            console.log('[fetchUserRepos] No token found');
            return [];
        }

        // Use type=all to explicitly include private repos that the token has access to
        // affiliation=owner ensures we get repos the user owns (including private ones)
        const url = 'https://api.github.com/user/repos?type=all&sort=pushed&per_page=50';
        console.log('[fetchUserRepos] Fetching:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (!response.ok) {
            console.warn('[fetchUserRepos] API Error:', response.status, response.statusText);
            return [];
        }

        const data = await response.json();
        console.log('[fetchUserRepos] Raw API response count:', data.length);
        console.log('[fetchUserRepos] Repos:', data.map((r: any) => ({ name: r.full_name, private: r.private })));

        return data.map((repo: any) => repo.html_url);
    } catch (e) {
        console.warn("[fetchUserRepos] Exception:", e);
        return [];
    }
}
