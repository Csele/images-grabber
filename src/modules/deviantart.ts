import co from "co";
import { writeFileSync } from "fs";
import { Question } from "inquirer";
import { extname } from "path";
import { promisify } from "util";
import * as xml2js from "xml2js";

import { req, wait, writeBuffer } from "../util/functions";
import { QuestionTypes, IService, IServiceSearch } from "./serviceTemplate";

class DeviantartSearch extends IServiceSearch {
    public authorID: string;
    private parser: xml2js.Parser;
    private parseXML;

    constructor(public data: string, options: any) {
        super(data, options);
        this.authorID = deviantart.regExpLink.exec(this.resource)[1];
        this.parser = new xml2js.Parser();
        this.parseXML = promisify(this.parser.parseString);
        this.service = deviantart.serviceName;
    }

    /**
     * Gets links of images from author page
     * @returns {Promise<string[]>}
     */
    public async getImages(): Promise<string[]> {
        this.images = await co(this.getIllusts());
        return this.images;
    }

    /**
     * Downloads image from pixiv url
     * @param {string} url
     * @param {number} index
     * @returns {Promise<void>}
     */
    public async downloadImage(url: string, index: number): Promise<void> {
        const file = `${this.filepath}/${index}${extname(url)}`;

        await req(url, {encoding: null})  // tslint:disable-line no-null-keyword
            .then(data => writeBuffer(file, data))
            .catch(e => this.events.emit("error", `Image (${url}) downloading error: ${e}`));
        await wait();

        this.events.emit("imageDownloaded", index);
    }

    private mediaReq(offset: number = 0): Promise<string> {
        // tslint:disable-next-line max-line-length
        return req(`http://backend.deviantart.com/rss.xml?type=deviation&q=by%3A${this.authorID}+sort%3Atime+meta%3Aall&offset=${offset}`)
            .catch((err) => {
                this.events.emit("error", `DeviantArt request error: ${err}`);
                return "";
            });
    }

    private getMedia(json): string[] {
        const {unsafe} = this.options;
        return json.rss.channel[0].item
            .map((el) => {
                if (el["media:rating"][0] === "adult") {
                    if (unsafe) {
                        return el["media:content"][0].$;
                    }
                    return undefined;
                }
                return el["media:content"][0].$;
            })
            .filter((el) => el && el.medium === "image")
            .map((el) => el.url);
    }

    private hasNextPage(json): boolean {
        return (!!json.rss.channel[0]["atom:link"][1] && json.rss.channel[0]["atom:link"][1].$.rel === "next")
            || (!!json.rss.channel[0]["atom:link"][2] && json.rss.channel[0]["atom:link"][2].$.rel === "next");
    }

    private getImagesCount(json): number {
        return json.rss.channel[0].item.length;
    }

    private async getPage(offset: number = 0) {
        const xml = await this.mediaReq(offset);
        const data = await this.parseXML(xml);

        const nextPage = this.hasNextPage(data);
        const count = this.getImagesCount(data) || 0;
        const images = this.getMedia(data) || [];

        return {nextPage, count, images};
    }

    private * getIllusts() {
        let json = yield this.getPage();
        let count = json.count;
        let results = json.images;
        this.events.emit("findImages", results.length);

        while (json.nextPage) {
            json = yield this.getPage(count);
            count += json.count;
            results = results.concat(json.images);
            this.events.emit("findImages", results.length);
        }
        this.events.emit("findImages", results.length);

        return results;
    }
}

const deviantart: IService = {
    questions:
        [
            {
                message: "Enter link to user whose pictures you want to grab (like http://sandara.deviantart.com/):",
                name: "link",
                type: QuestionTypes.input,
                validate(value) {
                    if (value.length && deviantart.validateLink(value)) {
                        return true;
                    }
                    return "Please enter valid link";
                },
                when: (answers) =>
                    answers.type === deviantart.serviceName && !answers.link,
            } as Question,
            {
                message: "Do you want to grab unsafe pictures?",
                name: "unsafe",
                type: QuestionTypes.confirm,
                when: (answers) =>
                    answers.type === deviantart.serviceName && answers.unsafe === undefined,
            } as Question,
        ],
    regExpLink: new RegExp(/(?:(?:http|https)(?::\/\/))?(?:www.)?(.{1,})(?:.deviantart.com(?:\/|))(?:.*)/i),
    search: (link: string, options: any) => new DeviantartSearch(link, options),
    serviceLink: "https://www.deviantart.com/",
    serviceName: "deviantart",
    validateLink: (link) => deviantart.regExpLink.test(link),
};

export { deviantart as default, DeviantartSearch as search };
