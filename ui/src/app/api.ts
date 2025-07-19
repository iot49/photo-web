export async function get_json(uri: string) {
  try {
    let response: Response;
    try {
      response = await fetch(uri, { method: 'GET', credentials: 'include', mode: 'cors' });
    } catch (error) {
      throw new Error(`Failed fetching ${uri}`, { cause: error });
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed fetching ${uri}`, { cause: error });
  }
}


export async function get_text(uri: string) {
  try {
    let response: Response;
    try {
      response = await fetch(uri, { method: 'GET', credentials: 'include', mode: 'cors' });
    } catch (error) {
      throw new Error(`Failed fetching ${uri}`, { cause: error });
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Failed fetching ${uri}`, { cause: error });
  }
}
