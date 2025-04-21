import React from 'react';
import { Participant } from '../stores/roomStore';
import { User, Crown } from 'lucide-react';

interface ParticipantsListProps {
  participants: Participant[];
  currentUserId: string;
}

const ParticipantsList: React.FC<ParticipantsListProps> = ({
  participants,
  currentUserId,
}) => {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4 flex items-center">
        <User className="h-5 w-5 mr-2 text-purple-500" />
        Participants ({participants.length})
      </h2>
      
      <div className="space-y-2">
        {participants.map((participant) => (
          <div
            key={participant.userId}
            className={`p-3 rounded-md ${
              participant.userId === currentUserId
                ? 'bg-purple-600/20 border border-purple-500/50'
                : 'bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center mr-3">
                  {participant.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{participant.displayName}</p>
                  {participant.userId === currentUserId && (
                    <p className="text-xs text-gray-400">You</p>
                  )}
                </div>
              </div>
              
              {participant.isHost && (
                <div className="flex items-center text-yellow-500">
                  <Crown className="h-4 w-4 mr-1" />
                  <span className="text-xs">Host</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantsList;