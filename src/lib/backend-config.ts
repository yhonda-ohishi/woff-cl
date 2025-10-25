// Helper functions to configure backend URL via Durable Object

export async function setBackendUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch("/api/set-backend-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Failed to set backend URL: ${response.statusText}`);
    }

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("Error setting backend URL:", error);
    return false;
  }
}

export async function getBackendUrl(): Promise<string | null> {
  try {
    const response = await fetch("/api/get-backend-url");

    if (!response.ok) {
      throw new Error(`Failed to get backend URL: ${response.statusText}`);
    }

    const result = await response.json();
    return result.url;
  } catch (error) {
    console.error("Error getting backend URL:", error);
    return null;
  }
}
