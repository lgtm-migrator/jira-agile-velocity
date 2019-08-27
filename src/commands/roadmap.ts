import { flags } from "@oclif/command";
import cli from "cli-ux";
import * as fs from "fs";
import * as loadYamlFile from "load-yaml-file";
import * as path from "path";
import * as readline from "readline";
import * as stream from "stream";

import * as SymbolTree from "symbol-tree";
import { convertArrayToCSV } from "convert-array-to-csv";
import { ICalendar, ICalendarFinal, IConfig, IJiraIssue } from "../global";
import Command from "../base";
import jiraSearchIssues from "../utils/jira/searchIssues";
import fetchCompleted from "../utils/data/fetchCompleted";
import fetchInitiatives from "../utils/data/fetchInitiatives";
import fetchChildren from "../utils/data/fetchChildren";
import { getWeeksBetweenDates, formatDate } from "../utils/misc/dateUtils";
import teamClosedByWeek from "../utils/roadmap/teamClosedByWeek";
import getEmptyCalendarObject from "../utils/roadmap/getEmptyCalendarObject";
import { formatDate, startOfWeek } from "../utils/misc/dateUtils";

export default class Roadmap extends Command {
  static description = "Build a roadmap from a set of issues";

  static flags = {
    ...Command.flags,
    help: flags.help({ char: "h" }),
    type: flags.string({
      char: "t",
      description: "Use issues of points for metrics",
      options: ["issues", "points"],
      default: "points"
    }),
    cache: flags.boolean({
      char: "c",
      description:
        "Use cached version of the child issues (mostly useful for dev)",
      default: false
    })
  };

  async run() {
    const { flags } = this.parse(Roadmap);
    let { type, cache } = flags;
    const userConfig = this.userConfig;
    const cacheDir = this.config.configDir + "/cache/";
    if (cache) {
      this.log(
        "=================================================================================="
      );
      this.log(
        "Will be fetching data from cache. NO CALLS WILL BE MADE TO JIRA TO REFRESH DATA "
      );
      this.log(
        "=================================================================================="
      );
    }
    // Creates an array of all closed issues across all teams
    let closedIssues: Array<IJiraIssue> = [];
    for (let team of userConfig.teams) {
      const teamIssues = await fetchCompleted(
        userConfig,
        this.config.configDir + "/cache/",
        team.name
      );
      closedIssues = [...closedIssues, ...teamIssues];
    }

    const emptyCalendar = getEmptyCalendarObject(closedIssues, userConfig);
    const closedIssuesByWeekAndTeam = teamClosedByWeek(
      closedIssues,
      userConfig,
      emptyCalendar
    );

    const initiativesIssues = await fetchInitiatives(
      userConfig,
      cacheDir,
      cache
    );

    // Structure the issues in an actual tree object for easier traversing
    //Note: Parent field (if parent is EPIC): customfield_10314
    //Note: Parent field (if parent is INITIATIVE): customfield_11112
    const issuesTree = new SymbolTree();
    const treeRoot = {};
    for (let initiative of initiativesIssues) {
      issuesTree.appendChild(treeRoot, initiative);
      const children = await fetchChildren(
        userConfig,
        initiative.key,
        cacheDir,
        cache
      );
      for (let l1child of children.filter(
        (ic: any) =>
          ic.fields[userConfig.jira.fields.parentInitiative] === initiative.key
      )) {
        issuesTree.appendChild(initiative, l1child);
        for (let l2child of children.filter(
          (ic: any) =>
            ic.fields[userConfig.jira.fields.parentEpic] === l1child.key
        )) {
          issuesTree.appendChild(l1child, l2child);
        }
      }
    }

    // Update all of the tree nodes with actual metrics
    this.prepareData(
      issuesTree,
      treeRoot,
      0,
      closedIssues,
      emptyCalendar,
      userConfig
    );

    const closedIssuesByWeekAndInitiative = this.exportData(
      issuesTree,
      treeRoot
    );

    const roadmapArtifact = {
      byTeam: closedIssuesByWeekAndTeam,
      byInitiative: closedIssuesByWeekAndInitiative
    };

    this.showArtifactsTable(roadmapArtifact);

    /*
    const issuesWithWeeks = this.appendWeeks(
      issuesTree,
      treeRoot,
      closedIssuesByWeek,
      userConfig
    );

    const exportData = this.exportData(issuesTree, treeRoot);

    const issueWeekFileStream = fs.createWriteStream(
      path.join(cacheDir, "roadmap-weeks.json"),
      { flags: "w" }
    );
    issueWeekFileStream.write(JSON.stringify(exportData));
    issueWeekFileStream.end();

    const exportDataToCsv = this.exportToTsv(exportData, closedIssuesByWeek);
    const csvFromArrayOfArrays = convertArrayToCSV(exportDataToCsv, {
      separator: ","
    });
    const issueCsvFileStream = fs.createWriteStream(
      path.join(cacheDir, "roadmap-artifact.csv"),
      { flags: "w" }
    );
    issueCsvFileStream.write(csvFromArrayOfArrays);
    issueCsvFileStream.end();

    const issuesTable = this.prepareTable(issuesTree, treeRoot, []);
    this.showConsoleTable(issuesTable);
    */

    const issueFileStream = fs.createWriteStream(
      path.join(cacheDir, "roadmap-artifacts.json"),
      { flags: "w" }
    );
    issueFileStream.write(JSON.stringify(roadmapArtifact));
    issueFileStream.end();
  }

  appendWeeks = (
    issuesTree: any,
    node: any,
    closedIssuesByWeek: Array<any>,
    userConfig: IConfig
  ) => {
    if (node.key !== undefined) {
      /*
      console.log(
        node.key + " children: " + issuesTree.treeToArray(node).length
      );
      */
      node.completionWeeks = closedIssuesByWeek.map(week => {
        const completedIssues = week.list.filter(i => {
          // Search issue in this list: issuesTree.treeToArray(node).length
          //            console.log(i);
          if (
            issuesTree.treeToArray(node).find((n: any) => n.key === i.key) !==
            undefined
          ) {
            console.log(
              "Found: " + node.key + " completed in week: " + week.weekStart
            );
            return true;
          }
          return false;
        });

        return {
          ...week,
          list: completedIssues,
          issues: { count: completedIssues.length },
          points: {
            count: completedIssues
              .map(
                (issue: IJiraIssue) =>
                  issue.fields[userConfig.jira.fields.points]
              )
              .reduce((acc: number, points: number) => acc + points, 0)
          }
        };
      });
    }
    for (const children of issuesTree.childrenIterator(node)) {
      this.appendWeeks(issuesTree, children, closedIssuesByWeek, userConfig);
    }
    return [];
  };

  prepareData = (
    issuesTree: any,
    node: any,
    level: number,
    closedIssues: Array<any>,
    emptyCalendar: any,
    userConfig: IConfig
  ) => {
    if (node.key !== undefined) {
      node.level = level;
      node.metrics = this.crunchMetrics(issuesTree, node);
      node.isLeaf = issuesTree.hasChildren(node) ? false : true;
      node.weeks = this.crunchWeeks(
        issuesTree,
        node,
        closedIssues,
        emptyCalendar,
        userConfig
      );
    }
    for (const children of issuesTree.childrenIterator(node)) {
      this.prepareData(
        issuesTree,
        children,
        level + 1,
        closedIssues,
        emptyCalendar,
        userConfig
      );
    }
    return [];
  };

  exportData = (issuesTree: any, node: any) => {
    const jsonObject = [];
    for (const initiative of issuesTree.childrenIterator(node)) {
      const epics = [];
      for (const epic of issuesTree.childrenIterator(initiative)) {
        const stories = [];
        for (const story of issuesTree.childrenIterator(epic)) {
          stories.push(story);
        }
        epic.children = stories;
        epics.push(epic);
      }
      initiative.children = epics;
      jsonObject.push(initiative);
    }
    return jsonObject;
  };

  exportToTsv = (data: any, closedIssuesByWeek: any) => {
    let jsonObject: any = [];
    const header = [
      "Type",
      "Key",
      "Title",
      "State",
      "Children",
      "Pts",
      "Progress"
    ];
    for (let week of data[0].completionWeeks) {
      header.push(week.weekStart.slice(0, 10));
    }
    console.log(header);
    jsonObject.push(header);

    const nonInitiatives = [
      "N/A",
      "N/A",
      "Effort spent outside of initiatives",
      "N/A",
      "N/A",
      "N/A",
      "N/A"
    ];
    for (let week of closedIssuesByWeek) {
      nonInitiatives.push(week.points.count);
    }
    jsonObject.push(nonInitiatives);

    for (let issue of data) {
      jsonObject = this.exportIssue(issue, jsonObject);
    }
    return jsonObject;
  };

  exportIssue = (issue: any, jsonObject: any) => {
    const issueExp: any = [
      issue.fields.issuetype.name,
      issue.key,
      issue.fields.summary,
      issue.fields.status.statusCategory.name,
      issue.children === undefined ? 0 : issue.children.length,
      this.formatPoints(issue),
      this.formatProgress(issue)
    ];
    for (let week of issue.completionWeeks) {
      issueExp.push(week.points.count);
    }
    jsonObject.push(issueExp);
    if (issue.children !== undefined && issue.children.length > 0) {
      for (let child of issue.children) {
        this.exportIssue(child, jsonObject);
      }
    }
    return jsonObject;
  };

  formatPoints = (issue: any) => {
    if (issue.isLeaf) {
      if (issue.metrics.missingPoints) {
        return "-";
      }
      return issue.metrics.points.total;
    }
    return "";
  };

  formatProgress = (issue: any) => {
    if (!issue.isLeaf) {
      let progress = "0%";
      let missing = "";
      if (issue.metrics.points.missing > 0) {
        missing =
          " (" +
          issue.metrics.points.missing +
          " open issues without estimate)";
      }
      if (issue.metrics.points.total > 0) {
        progress =
          Math.round(
            ((issue.metrics.points.completed * 100) /
              issue.metrics.points.total) *
              100
          ) /
            100 +
          "%";
      }
      return (
        issue.metrics.points.completed +
        "/" +
        issue.metrics.points.total +
        " - " +
        progress +
        missing
      );
    }
    return "";
  };

  crunchWeeks = (
    issuesTree: any,
    node: any,
    closedIssues: Array<any>,
    emptyCalendar: any,
    userConfig: IConfig
  ) => {
    return issuesTree.treeToArray(node).reduce((acc: any, item: any) => {
      // BACKLOG-10949
      // BACKLOG-10950
      // BACKLOG-10951
      const issueExist = closedIssues.find(i => i.key === item.key);

      if (issueExist !== undefined) {
        const firstDayWeekDate = startOfWeek(new Date(issueExist.closedAt));
        const firstDayWeekKey = firstDayWeekDate.toJSON().slice(0, 10);
        acc[firstDayWeekKey].list.push(issueExist);
        acc[firstDayWeekKey].issues.count = acc[firstDayWeekKey].list.length;
        if (
          issueExist.fields[userConfig.jira.fields.points] !== undefined &&
          issueExist.fields[userConfig.jira.fields.points] !== null
        ) {
          acc[firstDayWeekKey].points.count = acc[firstDayWeekKey].list
            .filter(
              (issue: IJiraIssue) =>
                issue.fields[userConfig.jira.fields.points] !== undefined &&
                issue.fields[userConfig.jira.fields.points] !== null
            )
            .map(
              (issue: IJiraIssue) => issue.fields[userConfig.jira.fields.points]
            )
            .reduce((acc: number, points: number) => acc + points, 0);
        }
      }
      return acc;
    }, JSON.parse(JSON.stringify(emptyCalendar)));
    /*
      if (parseInt(item.fields.customfield_10114, 10) > 0) {
        acc.points.total =
          acc.points.total + parseInt(item.fields.customfield_10114, 10);
        if (item.fields.status.statusCategory.name === "Done") {
          acc.points.completed =
            acc.points.completed + parseInt(item.fields.customfield_10114, 10);
        } else {
          acc.points.remaining =
            acc.points.remaining + parseInt(item.fields.customfield_10114, 10);
        }
      }
      if (
        (item.fields.customfield_10114 === undefined ||
          item.fields.customfield_10114 === null) &&
        issuesTree.hasChildren(node) === false
      ) {
        acc.missingPoints = true;
      }
      if (
        (item.fields.customfield_10114 === undefined ||
          item.fields.customfield_10114 === null) &&
        issuesTree.hasChildren(item) === false &&
        item.fields.status.statusCategory.name !== "Done"
      ) {
        acc.points.missing++;
      }
      acc.issues.total = acc.issues.total + 1;
      if (item.fields.status.statusCategory.name === "Done") {
        acc.issues.completed++;
      } else {
        acc.issues.remaining++;
      }
      */
  };

  crunchMetrics = (issuesTree: any, node: any) => {
    return issuesTree.treeToArray(node).reduce(
      (acc: any, item: any) => {
        if (parseInt(item.fields.customfield_10114, 10) > 0) {
          acc.points.total =
            acc.points.total + parseInt(item.fields.customfield_10114, 10);
          if (item.fields.status.statusCategory.name === "Done") {
            acc.points.completed =
              acc.points.completed +
              parseInt(item.fields.customfield_10114, 10);
          } else {
            acc.points.remaining =
              acc.points.remaining +
              parseInt(item.fields.customfield_10114, 10);
          }
        }
        if (
          (item.fields.customfield_10114 === undefined ||
            item.fields.customfield_10114 === null) &&
          issuesTree.hasChildren(node) === false
        ) {
          acc.missingPoints = true;
        }
        if (
          (item.fields.customfield_10114 === undefined ||
            item.fields.customfield_10114 === null) &&
          issuesTree.hasChildren(item) === false &&
          item.fields.status.statusCategory.name !== "Done"
        ) {
          acc.points.missing++;
        }
        acc.issues.total = acc.issues.total + 1;
        if (item.fields.status.statusCategory.name === "Done") {
          acc.issues.completed++;
        } else {
          acc.issues.remaining++;
        }
        return acc;
      },
      {
        missingPoints: false,
        points: { total: 0, completed: 0, remaining: 0, missing: 0 },
        issues: { total: 0, completed: 0, remaining: 0 }
      }
    );
  };

  prepareTable = (issuesTree: any, node: any, issuesTable: Array<any>) => {
    if (node.key !== undefined) {
      issuesTable.push(node);
    }
    //    console.log(node);
    //    console.log("----");

    for (const children of issuesTree.childrenIterator(node)) {
      this.prepareTable(issuesTree, children, issuesTable);
    }
    return issuesTable;
  };

  showConsoleTable = (issues: any) => {
    const columns: any = {
      prefix: {
        header: "-",
        get: (row: any) => {
          switch (row.level) {
            case 1:
              return "-----";
            case 2:
              return " |---";
            case 3:
              return " | |-";
          }
        }
      },
      type: {
        header: "Type",
        minWidth: "10",
        get: (row: any) => {
          return row.fields.issuetype.name;
        }
      },
      key: {
        header: "Key"
      },
      title: {
        header: "Title",
        get: (row: any) => {
          return row.fields.summary;
        }
      },
      state: {
        header: "State",
        minWidth: "10",
        get: (row: any) => {
          return row.fields.status.statusCategory.name;
        }
      },
      pts: {
        header: "Pts",
        get: (row: any) => {
          if (row.isLeaf) {
            if (row.metrics.missingPoints) {
              return "-";
            }
            return row.metrics.points.total;
          }
          return "";
        }
      },
      progress: {
        header: "Progress",
        minWidth: "5",
        get: (row: any) => {
          if (!row.isLeaf) {
            let progress = "0%";
            let missing = "";
            if (row.metrics.points.missing > 0) {
              missing =
                " (" +
                row.metrics.points.missing +
                " open issues without estimate)";
            }
            if (row.metrics.points.total > 0) {
              progress =
                Math.round(
                  ((row.metrics.points.completed * 100) /
                    row.metrics.points.total) *
                    100
                ) /
                  100 +
                "%";
            }
            return (
              row.metrics.points.completed +
              "/" +
              row.metrics.points.total +
              " - " +
              progress +
              missing
            );
          }
          return "";
        }
      }
    };
    cli.table(issues, columns);
  };

  showArtifactsTable = (roadmapArtifact: any) => {
    const columnsByTeam: any = {
      name: {
        header: "Team",
        minWidth: "10",
        get: (row: any) => {
          if (row.name === null) {
            return "TOTAL";
          }
          return row.name;
        }
      }
    };
    for (let week of roadmapArtifact.byTeam[0].weeks) {
      const weekId = week.weekStart.slice(0, 10);
      columnsByTeam[weekId] = { header: weekId };
    }
    cli.table(
      roadmapArtifact.byTeam.map((team: any) => {
        const teamData = { ...team };
        for (let week of team.weeks) {
          const weekId = week.weekStart.slice(0, 10);
          teamData[weekId] = week.points.count;
        }
        return teamData;
      }),
      columnsByTeam
    );

    const columnsByInitiative: any = {
      prefix: {
        header: "-",
        get: (row: any) => {
          switch (row.level) {
            case 1:
              return "-----";
            case 2:
              return " |---";
            case 3:
              return " | |-";
          }
        }
      },
      type: {
        header: "Type",
        minWidth: "10",
        get: (row: any) => {
          return row.fields.issuetype.name;
        }
      },
      key: {
        header: "Key"
      },
      title: {
        header: "Title",
        get: (row: any) => {
          return row.fields.summary;
        }
      },
      state: {
        header: "State",
        minWidth: "10",
        get: (row: any) => {
          return row.fields.status.statusCategory.name;
        }
      },
      pts: {
        header: "Pts",
        get: (row: any) => {
          if (row.isLeaf) {
            if (row.metrics.missingPoints) {
              return "-";
            }
            return row.metrics.points.total;
          }
          return "";
        }
      },
      progress: {
        header: "Progress",
        minWidth: "5",
        get: (row: any) => {
          if (!row.isLeaf) {
            let progress = "0%";
            let missing = "";
            if (row.metrics.points.missing > 0) {
              missing =
                " (" +
                row.metrics.points.missing +
                " open issues without estimate)";
            }
            if (row.metrics.points.total > 0) {
              progress =
                Math.round(
                  ((row.metrics.points.completed * 100) /
                    row.metrics.points.total) *
                    100
                ) /
                  100 +
                "%";
            }
            return (
              row.metrics.points.completed +
              "/" +
              row.metrics.points.total +
              " - " +
              progress +
              missing
            );
          }
          return "";
        }
      }
    };
    for (let week of Object.values(roadmapArtifact.byInitiative[0].weeks)) {
      const weekId = week.weekStart.slice(0, 10);
      columnsByInitiative[weekId] = { header: weekId };
    }
    cli.table(
      roadmapArtifact.byInitiative.map((initiative: any) => {
        const initiativeData = { ...initiative };
        for (let week of Object.values(initiative.weeks)) {
          const weekId = week.weekStart.slice(0, 10);
          initiativeData[weekId] = week.points.count;
        }
        return initiativeData;
      }),
      columnsByInitiative
    );
  };
}

//https://medium.com/@wietsevenema/node-js-using-for-await-to-read-lines-from-a-file-ead1f4dd8c6f
const readLines = (input: any) => {
  const output = new stream.PassThrough({ objectMode: true });
  const rl = readline.createInterface({ input });
  rl.on("line", line => {
    output.write(line);
  });
  rl.on("close", () => {
    output.push(null);
  });
  return output;
};
