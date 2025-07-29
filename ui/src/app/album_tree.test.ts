/// <reference types="jest" />
import { album_tree } from "./album_tree";
import { Albums } from "./interfaces";
import { get_json } from "./api";

describe('album_tree', () => {
    let albums: Albums;

    beforeAll(async () => {
        // Fetch real album data from the API
        albums = await get_json('/photos/api/albums');
    });

    it('should correctly convert a flat list of albums into a tree structure', async () => {
        const tree = album_tree(albums);

        // Expect root to have undefined name and nodes
        expect(tree.name).toBeUndefined();
        expect(tree.albums).toBeDefined();
        expect(tree.nodes).toBeDefined();

        // Check that we have some albums or nodes
        const totalAlbums = tree.albums.length;
        const totalNodes = tree.nodes.length;
        expect(totalAlbums + totalNodes).toBeGreaterThan(0);

        // If we have nodes, check they are sorted alphabetically
        if (tree.nodes.length > 1) {
            for (let i = 1; i < tree.nodes.length; i++) {
                expect(tree.nodes[i].name!.localeCompare(tree.nodes[i-1].name!)).toBeGreaterThanOrEqual(0);
            }
        }

        // If we have albums at root level, check they are sorted alphabetically by title
        if (tree.albums.length > 1) {
            for (let i = 1; i < tree.albums.length; i++) {
                expect(tree.albums[i].title.localeCompare(tree.albums[i-1].title)).toBeGreaterThanOrEqual(0);
            }
        }

        // Check that each node has properly structured albums and subnodes
        tree.nodes.forEach(node => {
            expect(node.albums).toBeDefined();
            expect(node.nodes).toBeDefined();
            
            // Check albums within node are sorted by title
            if (node.albums.length > 1) {
                for (let i = 1; i < node.albums.length; i++) {
                    expect(node.albums[i].title.localeCompare(node.albums[i-1].title)).toBeGreaterThanOrEqual(0);
                }
            }
            
            // Check subnodes are sorted by name
            if (node.nodes.length > 1) {
                for (let i = 1; i < node.nodes.length; i++) {
                    expect(node.nodes[i].name!.localeCompare(node.nodes[i-1].name!)).toBeGreaterThanOrEqual(0);
                }
            }
        });
    });

    it('should handle empty albums input', () => {
        const tree = album_tree({});
        expect(tree.name).toBeUndefined();
        expect(tree.nodes.length).toBe(0);
        expect(tree.albums.length).toBe(0);
    });

    it('should handle albums with empty paths', () => {
        const albumsWithEmptyPath: Albums = {
            "album1": { "uuid": "album1", "title": "Root Album", "path": "", "realm": 3, "persons": [], "keywords": [], "public": false }
        };
        const tree = album_tree(albumsWithEmptyPath);
        expect(tree.name).toBeUndefined();
        expect(tree.nodes.length).toBe(0);
        expect(tree.albums.length).toBe(1);
        expect(tree.albums[0].title).toBe('Root Album');
    });

    it('should handle albums with paths that are just "/"', () => {
        const albumsWithSlashPath: Albums = {
            "album1": { "uuid": "album1", "title": "Root Album", "path": "/", "realm": 3, "persons": [], "keywords": [], "public": false }
        };
        const tree = album_tree(albumsWithSlashPath);
        expect(tree.name).toBeUndefined();
        expect(tree.nodes.length).toBe(0);
        expect(tree.albums.length).toBe(1);
        expect(tree.albums[0].title).toBe('Root Album');
    });

    it('should correctly sort nodes alphabetically by name', () => {
        const unsortedAlbums: Albums = {
            "albumB": { "uuid": "albumB", "title": "Album B", "path": "Z/Y", "realm": 3, "persons": [], "keywords": [], "public": false },
            "albumA": { "uuid": "albumA", "title": "Album A", "path": "A/B", "realm": 3, "persons": [], "keywords": [], "public": false }
        };
        const tree = album_tree(unsortedAlbums);
        expect(tree.nodes[0].name).toBe('A');
        expect(tree.nodes[1].name).toBe('Z');
    });

    it('should correctly sort albums alphabetically by title within a node', () => {
        const unsortedAlbums: Albums = {
            "album1": { "uuid": "album1", "title": "Zebra", "path": "Animals", "realm": 3, "persons": [], "keywords": [], "public": false },
            "album2": { "uuid": "album2", "title": "Antelope", "path": "Animals", "realm": 3, "persons": [], "keywords": [], "public": false }
        };
        const tree = album_tree(unsortedAlbums);
        const animalsNode = tree.nodes.find(node => node.name === 'Animals');
        expect(animalsNode?.albums[0].title).toBe('Antelope');
        expect(animalsNode?.albums[1].title).toBe('Zebra');
    });

    it('should validate album structure from API', async () => {
        // Test that the fetched albums have the expected structure
        expect(albums).toBeDefined();
        expect(typeof albums).toBe('object');

        // Check each album has required properties
        Object.values(albums).forEach(album => {
            expect(album.uuid).toBeDefined();
            expect(album.title).toBeDefined();
            expect(album.path).toBeDefined();
            expect(album.public).toBeDefined();
            expect(album.persons).toBeDefined();
            expect(album.keywords).toBeDefined();
            expect(Array.isArray(album.persons)).toBe(true);
            expect(Array.isArray(album.keywords)).toBe(true);
        });
    });
});