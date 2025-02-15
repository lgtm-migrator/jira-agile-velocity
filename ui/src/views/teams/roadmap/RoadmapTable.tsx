import React, { FC } from 'react';
import { useDispatch } from 'react-redux';

import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import LinearProgress, {
  linearProgressClasses,
} from '@mui/material/LinearProgress';

// import ProgressBar from 'react-bootstrap/ProgressBar';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

import { RootState, Dispatch } from '../../../store';

import { getProgress, getBarVariant, getEstimateState } from '../utils';

interface Props {
  defaultPoints: boolean;
  issues: Array<any>;
  jiraHost: string;
}

const BorderLinearProgress = styled(LinearProgress)(({ theme }) => ({
  height: 10,
  borderRadius: 5,
  [`&.${linearProgressClasses.colorPrimary}`]: {
    backgroundColor:
      theme.palette.grey[theme.palette.mode === 'light' ? 200 : 800],
  },
  [`& .${linearProgressClasses.bar}`]: {
    borderRadius: 5,
    backgroundColor: theme.palette.mode === 'light' ? '#1a90ff' : '#308fe8',
  },
}));

const RoadmapTable: FC<Props> = ({ defaultPoints, issues, jiraHost }) => {
  const dispatch = useDispatch<Dispatch>();
  const setGraphInitiative = dispatch.initiatives.setGraphInitiative;
  const updateGraph = dispatch.initiatives.updateGraph;
  const setOpenGraph = dispatch.initiatives.setOpenGraph;
  const setJiraHost = dispatch.initiatives.setJiraHost;

  const metric = !defaultPoints ? 'issues' : 'points';
  return (
    <Table sx={{ minWidth: 650 }} size="small" aria-label="a dense table">
      <TableHead>
        <TableRow>
          <TableCell style={{ width: 20 }}></TableCell>
          <TableCell style={{ width: 20 }}></TableCell>
          <TableCell style={{ width: 150 }}>Key</TableCell>
          <TableCell>Title</TableCell>
          <TableCell style={{ width: 250 }}>Team</TableCell>
          <TableCell style={{ width: 150 }}>Remaining</TableCell>
          <TableCell style={{ width: 20 }}>Points</TableCell>
          <TableCell style={{ width: 130 }}>Estimated</TableCell>
          <TableCell style={{ width: 130 }}>Issues Count</TableCell>
          <TableCell style={{ width: 130 }}>State</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {issues.map((i: any) => {
          const progressPoints = getProgress(i, 'points');
          const progressIssues = getProgress(i, 'issues');
          const progressEstimate = getEstimateState(i);
          return (
            <TableRow
              key={i.key}
              sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >
              <TableCell component="th" scope="row">
                <IconButton
                  aria-label="open-external"
                  size="small"
                  href={jiraHost + '/browse/' + i.key}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </TableCell>
              <TableCell component="th" scope="row">
                <IconButton
                  aria-label="open-external"
                  size="small"
                  onClick={() => {
                    console.log('Click');
                    setJiraHost(jiraHost);
                    setGraphInitiative(
                      issues.find((is: any) => is.key === i.key),
                    );
                    updateGraph();
                    setOpenGraph(true);
                  }}
                >
                  <BubbleChartIcon fontSize="small" />
                </IconButton>
              </TableCell>
              <TableCell>{i.key}</TableCell>
              <TableCell>{i.summary}</TableCell>
              <TableCell>
                {i.assignee === null || i.assignee === undefined
                  ? 'n/a'
                  : i.assignee.displayName}
              </TableCell>
              <TableCell>{i.metrics[metric].remaining}</TableCell>
              <TableCell>
                <BorderLinearProgress
                  variant="determinate"
                  value={progressPoints.progress}
                />
                <span style={{ color: '#000' }}>
                  {progressPoints.progress}% ({progressPoints.completed}/
                  {progressPoints.total})
                </span>
              </TableCell>
              <TableCell>
                <span style={{ color: '#000' }}>
                  {progressEstimate.progress}% ({progressEstimate.esimtated}/
                  {progressEstimate.total})
                </span>
              </TableCell>
              <TableCell>
                <BorderLinearProgress
                  variant="determinate"
                  value={progressIssues.progress}
                />
                <span style={{ color: '#000' }}>
                  {progressIssues.progress}% ({progressIssues.completed}/
                  {progressIssues.total})
                </span>
              </TableCell>
              <TableCell>{i.status.name}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
export default RoadmapTable;
