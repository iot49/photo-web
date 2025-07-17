/// <reference types="jest" />
import { album_tree } from "./album_tree";
import { Albums } from "./interfaces";

describe('album_tree', () => {
    const sampleAlbums: Albums = {
        "1224A2FA-6C57-4CE7-9ADE-0BAC04A23462": { "uuid": "1224A2FA-6C57-4CE7-9ADE-0BAC04A23462", "title": "GTA 2023", "path": "Private/Europe", "realm": 3, "date": { "start": "2023-07-01T13:15:18.269000+02:00", "end": "2023-07-23T14:09:54.220000+02:00" }, "location": { "longitude": 7.1230625, "latitude": 44.43835583333333, "radius": 1.2946883333333332 }, "persons": [], "keywords": [], "thumbnail": "DD204DB3-2A88-4082-8546-1C2836A6EBBD", "public": false },
        "2527DC79-3C46-4A6E-9AC8-7CF469566065": { "uuid": "2527DC79-3C46-4A6E-9AC8-7CF469566065", "title": "Baja 2022/23", "path": "Private/Vacation", "realm": 3, "date": { "start": "2022-11-07T09:37:41.946000-08:00", "end": "2022-12-10T14:10:25.335000-07:00" }, "location": { "longitude": -112.08199666666667, "latitude": 26.623239166666664, "radius": 4.705338333333334 }, "persons": [], "keywords": [], "thumbnail": "D29B2DB9-30BD-49D8-AFCE-F48B1D26F313", "public": false },
        "1DFD7911-505D-4B0B-AE41-4344CE3F5E0C": { "uuid": "1DFD7911-505D-4B0B-AE41-4344CE3F5E0C", "title": "Briefmarken", "path": "Private", "realm": 3, "date": { "start": "2020-04-14T11:29:49.642000-07:00", "end": "2020-04-14T15:23:18.245000-07:00" }, "location": { "longitude": -120.04478474999999, "latitude": 38.470729164999995, "radius": 0.0007194999999882157 }, "persons": [], "keywords": [], "thumbnail": "4B92DC71-D57D-4747-B052-821CF87AAB02", "public": false },
        "CE6D4D05-AFB2-4CBA-B75F-E4007E3AA468": { "uuid": "CE6D4D05-AFB2-4CBA-B75F-E4007E3AA468", "title": "Lidar", "path": "Private", "realm": 3, "date": { "start": "2020-04-04T16:27:22.959000-07:00", "end": "2020-04-04T16:30:54.370541-07:00" }, "location": { "longitude": -120.04494449999997, "latitude": 38.470641670000006, "radius": 0.0 }, "persons": [], "keywords": [], "thumbnail": "0D3875DD-6719-40B8-9E3D-AC1580A5FB55", "public": false },
        "A6ADBC44-47CA-4C05-A11E-A2AB566DFD0B": { "uuid": "A6ADBC44-47CA-4C05-A11E-A2AB566DFD0B", "title": "WhatsApp", "path": "Private/Europe", "realm": 3, "date": { "start": "2020-04-18T02:49:08-07:00", "end": "2022-03-27T07:10:08-07:00" }, "location": null, "persons": ["Denise Passy"], "keywords": [], "thumbnail": "2D9ACF33-C281-459B-818C-AD26940301B4", "public": false },
        "0AB8C601-7621-40F2-9176-4BA82AADC66A": { "uuid": "0AB8C601-7621-40F2-9176-4BA82AADC66A", "title": "Zürich & Winkel", "path": "Private/Europe", "realm": 3, "date": { "start": "1950-01-01T12:00:01.314000-08:00", "end": "2012-01-02T12:20:48.806000-08:00" }, "location": { "longitude": 8.545765334999999, "latitude": 47.493101499999995, "radius": 0.0003826699999986971 }, "persons": ["Fanny Felicitas Meyer"], "keywords": ["Familiengeschichte", "Meyer", "Other", "Places", "Switzerland", "Tusculum", "Zurich", "People", "Europe", "Highlights"], "thumbnail": "F5177B27-4C0A-4CE6-9131-49ADB17128BB", "public": false },
        "D9DCEEFB-A7BD-463D-B460-FEDA8545BE43": { "uuid": "D9DCEEFB-A7BD-463D-B460-FEDA8545BE43", "title": "955 Creston Road", "path": "Private", "realm": 3, "date": { "start": "2008-10-23T18:49:18-07:00", "end": "2020-03-26T10:35:05.397516-07:00" }, "location": { "longitude": -122.259635835, "latitude": 37.896629165, "radius": 0.0007783300000028248 }, "persons": [], "keywords": ["USA", "Panorama", "Places", "Other", "California", "955 Creston Road", "Berkeley", "Bay Area"], "thumbnail": "FAD6CE94-FEAB-4497-90FA-AD3FE27C077C", "public": false },
        "E6C34C36-7EE9-4818-9C0F-9CDA702D0C99": { "uuid": "E6C34C36-7EE9-4818-9C0F-9CDA702D0C99", "title": "Tusculum 2019", "path": "Private/Europe", "realm": 3, "date": { "start": "2019-12-12T11:34:49.218329-08:00", "end": "2019-12-12T11:38:45.997378-08:00" }, "location": null, "persons": [], "keywords": [], "thumbnail": "DE98BA07-C4D5-4C0A-9357-0671E6BD8F2D", "public": false },
        "71C31D4F-4CCD-40D9-BD31-EC21CC18BF0C": { "uuid": "71C31D4F-4CCD-40D9-BD31-EC21CC18BF0C", "title": "Eachine GPS", "path": "Private", "realm": 3, "date": { "start": "2020-06-04T13:44:43.514731-07:00", "end": "2020-06-17T16:51:42.221000-07:00" }, "location": { "longitude": -120.01695975, "latitude": 38.46712917000001, "radius": 3.050000000826003e-05 }, "persons": [], "keywords": [], "thumbnail": "8CC7296E-B999-48F8-91DF-325A6777B4F7", "public": false },
        "A1F4B36F-8E1A-4AB1-85BE-A78E9B458C1D": { "uuid": "A1F4B36F-8E1A-4AB1-85BE-A78E9B458C1D", "title": "DJI Album", "path": "Private", "realm": 3, "date": { "start": "2022-12-12T15:05:08-07:00", "end": "2023-01-04T11:50:54-07:00" }, "location": { "longitude": -110.93895, "latitude": 25.00713, "radius": 1.4739933333333326 }, "persons": ["Bernhard Boser"], "keywords": [], "thumbnail": "DC4EBC18-83AE-44FC-B548-F6EF1562BE9A", "public": false },
        "9CF7814F-E3CF-4700-9522-BFA7D918D9BF": { "uuid": "9CF7814F-E3CF-4700-9522-BFA7D918D9BF", "title": "Chile", "path": "Private/Vacation", "realm": 3, "date": { "start": "2020-01-12T11:32:24.754000-08:00", "end": "2020-03-19T16:23:34.842000-07:00" }, "location": { "longitude": -96.41414749999998, "latitude": -7.342879419999999, "radius": 91.6272855 }, "persons": ["Bernhard Boser", "Isabelle Guyon"], "keywords": [], "thumbnail": "20430E45-7458-4419-A404-21C34F72D7B5", "public": false },
        "99AA78CA-FA59-4931-AD7B-C65FF93A9CDA": { "uuid": "99AA78CA-FA59-4931-AD7B-C65FF93A9CDA", "title": "Assembly", "path": "Private/UC/IoT49/Robot", "realm": 3, "date": { "start": "2018-06-09T09:03:51.067000-07:00", "end": "2018-06-09T09:50:41.371000-07:00" }, "location": { "longitude": -122.25924667, "latitude": 37.896513330000005, "radius": 0.0 }, "persons": [], "keywords": [], "thumbnail": "58B21D4F-8716-40B2-8901-7775551B54AA", "public": false },
        "CD1AEC4F-E8D1-4B35-8C7F-9FB2D8CD72DD": { "uuid": "CD1AEC4F-E8D1-4B35-8C7F-9FB2D8CD72DD", "title": "Assembled", "path": "Private/UC/IoT49/Robot", "realm": 3, "date": { "start": "2018-06-09T09:41:20.977000-07:00", "end": "2018-06-09T09:41:20.977000-07:00" }, "location": { "longitude": -122.25924667, "latitude": 37.896513330000005, "radius": 0.0 }, "persons": [], "keywords": [], "thumbnail": "C725074E-60ED-48A1-A1D3-A33ADD0D75F4", "public": false },
        "6B39DE07-542E-4874-B215-DF9682AD7ED4": { "uuid": "6B39DE07-542E-4874-B215-DF9682AD7ED4", "title": "Die Shots", "path": "Private/UC", "realm": 3, "date": { "start": "2000-01-11T09:09:19-08:00", "end": "2014-01-05T19:59:00-08:00" }, "location": null, "persons": [], "keywords": ["die shots"], "thumbnail": "DCCCFCB7-0BB1-4B4B-80E1-E3534BBA8661", "public": false },
        "0E6C4EB0-11DB-43E1-86CF-3580791C0F3E": { "uuid": "0E6C4EB0-11DB-43E1-86CF-3580791C0F3E", "title": "ImmunoSensor", "path": "Private/UC", "realm": 3, "date": { "start": "2004-06-15T07:02:33-07:00", "end": "2014-01-05T20:19:47-08:00" }, "location": null, "persons": [], "keywords": [], "thumbnail": "CAB802EB-3159-4C12-A285-D9BBD1DA2421", "public": false },
        "DCACF14E-E77F-4C6D-9BCD-C94E544FC3C7": { "uuid": "DCACF14E-E77F-4C6D-9BCD-C94E544FC3C7", "title": "Microfluidics", "path": "Private/UC", "realm": 3, "date": { "start": "2009-03-27T11:32:33-07:00", "end": "2009-03-27T11:56:50-07:00" }, "location": null, "persons": [], "keywords": ["Microfluidics", "Work"], "thumbnail": "95B6A722-2B51-4D1F-81B5-BC2B514FC9EA", "public": false },
        "8D215E2A-D66A-466E-ACA2-2F43E6375C63": { "uuid": "8D215E2A-D66A-466E-ACA2-2F43E6375C63", "title": "Fall 2024", "path": "Private/Vacation", "realm": 3, "date": { "start": "2024-08-11T17:06:17.892000+02:00", "end": "2024-09-28T12:36:39.093000-07:00" }, "location": { "longitude": -49.54194308333334, "latitude": 13.753087499999998, "radius": 149.20024716666666 }, "persons": [], "keywords": [], "thumbnail": "5650C066-FB19-4B8B-AB9F-0DD4F79A1AA2", "public": false },
        "F04C8C5B-4D02-4848-AFE4-02F0251CDE52": { "uuid": "F04C8C5B-4D02-4848-AFE4-02F0251CDE52", "title": "TestAlbum", "path": "Public/Test", "realm": 1, "date": { "start": "2011-08-01T17:47:04-07:00", "end": "2025-01-14T10:12:55.063000-08:00" }, "location": { "longitude": -58.64102391666667, "latitude": -2.4941388933333357, "radius": 130.8017245 }, "persons": ["Bernhard Boser", "Isabelle Guyon", "Thomas Boser"], "keywords": ["Boser-Guyon", "Philip", "Thomas", "TPA", "Birthday", "Creston", "People", "Events"], "thumbnail": "3A59AF3F-6843-4DD6-B0E8-A6BDB3CFE572", "public": false },
        "C9507CA4-8B39-4C6E-BD0F-52B643AE2FDA": { "uuid": "C9507CA4-8B39-4C6E-BD0F-52B643AE2FDA", "title": "Boser-Guyon", "path": "Private", "realm": 3, "date": { "start": "1961-06-24T16:00:00-07:00", "end": "2024-12-27T17:06:33.335000-08:00" }, "location": { "longitude": -56.921902346555484, "latitude": -0.5534478076475473, "radius": 130.9525219735557 }, "persons": ["Isabelle Guyon", "Kaspar Emanuel Landolt", "Bernhard Boser", "Sabine Boser", "Verena Emilie Mathilde Meyer", "Anna", "Marc", "Gabi Landolt", "Philip Boser", "Thomas Boser", "Christoph Landolt", "Hermann Landolt", "Erika Lina Marti"], "keywords": ["Boser-Guyon", "Philip", "Christof", "Kaspar", "Switzerland", "Sledding", "Sierra Nevada", "Bernhard's Family", "People", "Stadt Zurich", "Boser-Marti", "Claro", "Thomas", "Photobook", "Volketswil", "Snowplay (Skiing", "Activities", "California", "House in Brogo", "Erika", "Highlights", "Zurichbergstrasse 27", "USA", "Gaby", "Elena", "Hermann", "Zurich", "Sabine", "Europe", "Alpine / Calaveras", "Isabelle", "Family", "TPA", "Familiengeschichte", "Places", "Other", "Marc", "Landolt", "Verena", "397 Schimke", "Kapla", "Jonathan", "Bear Valley", "Ticino"], "thumbnail": "60CEEADA-C115-4958-8AD1-84E4B822A269", "public": false }
    };

    it('should correctly convert a flat list of albums into a tree structure', () => {
        const tree = album_tree(sampleAlbums);

        // Expect root to have undefined name and nodes
        expect(tree.name).toBeUndefined();
        expect(tree.albums.length).toBe(0); // Root should not contain albums directly

        // Check top-level nodes
        expect(tree.nodes.length).toBe(2); // Private, Public
        expect(tree.nodes[0].name).toBe('Private');
        expect(tree.nodes[1].name).toBe('Public');

        // Check Private node
        const privateNode = tree.nodes.find(node => node.name === 'Private');
        expect(privateNode).toBeDefined();
        expect(privateNode?.albums.length).toBe(6); // Briefmarken, Lidar, 955 Creston Road, Eachine GPS, DJI Album, Boser-Guyon
        expect(privateNode?.albums[0].title).toBe('955 Creston Road');
        expect(privateNode?.albums[1].title).toBe('Boser-Guyon');
        expect(privateNode?.albums[2].title).toBe('Briefmarken');
        expect(privateNode?.albums[3].title).toBe('DJI Album');
        expect(privateNode?.albums[4].title).toBe('Eachine GPS');
        expect(privateNode?.albums[5].title).toBe('Lidar');

        expect(privateNode?.nodes.length).toBe(3); // Europe, UC, Vacation

        // Check Private/Europe node
        const europeNode = privateNode?.nodes.find(node => node.name === 'Europe');
        expect(europeNode).toBeDefined();
        expect(europeNode?.albums.length).toBe(4); // GTA 2023, WhatsApp, Zürich & Winkel, Tusculum 2019
        expect(europeNode?.albums[0].title).toBe('GTA 2023');
        expect(europeNode?.albums[1].title).toBe('Tusculum 2019');
        expect(europeNode?.albums[2].title).toBe('WhatsApp');
        expect(europeNode?.albums[3].title).toBe('Zürich & Winkel');

        // Check Private/UC node
        const ucNode = privateNode?.nodes.find(node => node.name === 'UC');
        expect(ucNode).toBeDefined();
        expect(ucNode?.albums.length).toBe(3); // Die Shots, ImmunoSensor, Microfluidics
        expect(ucNode?.albums[0].title).toBe('Die Shots');
        expect(ucNode?.albums[1].title).toBe('ImmunoSensor');
        expect(ucNode?.albums[2].title).toBe('Microfluidics');
        expect(ucNode?.nodes.length).toBe(1); // IoT49

        // Check Private/UC/IoT49 node
        const iot49Node = ucNode?.nodes.find(node => node.name === 'IoT49');
        expect(iot49Node).toBeDefined();
        expect(iot49Node?.albums.length).toBe(0);
        expect(iot49Node?.nodes.length).toBe(1); // Robot

        // Check Private/UC/IoT49/Robot node
        const robotNode = iot49Node?.nodes.find(node => node.name === 'Robot');
        expect(robotNode).toBeDefined();
        expect(robotNode?.albums.length).toBe(2); // Assembly, Assembled
        expect(robotNode?.albums[0].title).toBe('Assembled');
        expect(robotNode?.albums[1].title).toBe('Assembly');

        // Check Private/Vacation node
        const vacationNode = privateNode?.nodes.find(node => node.name === 'Vacation');
        expect(vacationNode).toBeDefined();
        expect(vacationNode?.albums.length).toBe(3); // Baja 2022/23, Chile, Fall 2024
        expect(vacationNode?.albums[0].title).toBe('Baja 2022/23');
        expect(vacationNode?.albums[1].title).toBe('Chile');
        expect(vacationNode?.albums[2].title).toBe('Fall 2024');

        // Check Public node
        const publicNode = tree.nodes.find(node => node.name === 'Public');
        expect(publicNode).toBeDefined();
        expect(publicNode?.albums.length).toBe(0);
        expect(publicNode?.nodes.length).toBe(1); // Test

        // Check Public/Test node
        const testNode = publicNode?.nodes.find(node => node.name === 'Test');
        expect(testNode).toBeDefined();
        expect(testNode?.albums.length).toBe(1); // TestAlbum
        expect(testNode?.albums[0].title).toBe('TestAlbum');
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
});