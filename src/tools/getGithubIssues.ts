export async function getGithubIssues() {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
  
    if (!token || !owner || !repo) {
      throw new Error(
        "GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO が設定されていません。",
      );
    }
  
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
  
    if (!response.ok) {
      throw new Error(
        `GitHub API Error: ${response.status} ${response.statusText}`,
      );
    }
  
    const issues = await response.json();
  
    //return issues;
    return issues.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
    }));
  }